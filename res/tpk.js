var basemaps = {
  topo: {
    basicURL: 'http://services.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer',
    tilePackageURL: 'http://tiledbasemaps.arcgis.com/arcgis/rest/services/World_Topo_Map/MapServer'
  }
};

function pollJob(def, token, functionUrl, jobId) {
  var statusURL = functionUrl + '/jobs/' + jobId,
      pollRequestData = {
        token: token,
        f: 'json'
      };

  function readJobResult(status) {
    var resultUrl = statusURL + '/' + status.results.out_service_url.paramUrl;
    $.post(resultUrl, pollRequestData, null, 'json')
      .then(function parseJobResult(jobResult) {
        def.resolve(jobResult.value);
      })
      .fail(function (err) {
        console.error('Failed to read completed job results: ' + jobId);
        def.reject(err);
      });
  }

  $.post(statusURL, pollRequestData, null, 'json')
    .done(function checkStatus(status) {
      if (status.jobStatus === 'esriJobSucceeded') {
        window.clearInterval(__appState().jobs[jobId].pollingId);
        readJobResult(status);
      } else if (status.jobStatus === 'esriJobFailed') {
        window.clearInterval(__appState().jobs[jobId].pollingId);
        def.reject(status);
      } else {
        console.log(jobId + ' continuing: ' + status.jobStatus);
      }
    })
    .fail(function (err) {
      window.clearInterval(__appState().jobs[jobId].pollingId);
      console.error('Unable to poll job status: ' + jobId);
      def.reject(err);
    });
}

function requestTPKEstimate(targetGeom, zoomLevels) {
  var user = __appState().portalUser;
  if (user === undefined) {
    console.error('Not logged in!');
    return;
  }

  return performTPKOperation('topo', targetGeom, zoomLevels, user.credential.token, true);
}

function requestTPK(targetGeom, zoomLevels) {
  var def = new dojo.Deferred();

  var user = __appState().portalUser;
  if (user === undefined) {
    console.error('Not logged in!');
    return;
  }

  performTPKOperation('topo', targetGeom, zoomLevels, user.credential.token, false)
    .then(function (tpkResultUrl) {
      $.post(tpkResultUrl, {
        token: user.credential.token,
        f: 'json'
      })
        .done(function (tpkFilesInfo) {
          tpkFilesInfo = JSON.parse(tpkFilesInfo);
          def.resolve(tpkFilesInfo.files[0].url);
        })
        .fail(function (err) {
          def.reject(err);
        });
    });

  return def;
}

function performTPKOperation(basemapName, targetGeom, zoomLevels, token, estimate) {
  var def = new dojo.Deferred();

  var requestData = {
    tilePackage: true,
    exportBy: 'LevelID',
    exportExtent: JSON.stringify(targetGeom.toJson()),
    token: token,
    levels: zoomLevels.join(),
    f: 'json'
  };

  var url = basemaps[basemapName].tilePackageURL + (estimate?'/estimateExportTilesSize':'/exportTiles');

  $.post(url, requestData, null, 'json')
    .done(function estimateRequestPostedOK(jobJSON) {
      var jobId = jobJSON.jobId;

      __appState().jobs[jobId] = {
        status: jobJSON.jobStatus,
        lastChecked: new Date(),
        pollingId: window.setInterval(function () {
          pollJob(def, requestData.token, url, jobId);
        }, 2000)
      };
    })
    .fail(function (err) {
      console.error('Unable to request estimate');
      console.log(err);
    });

  return def;
}

function getExtentCountsForGeometry(targetGeom, zoomLevels) {
  var def = new dojo.Deferred();

  (function () {
    var exts = getExtentsForGeomExtentWithTileInfo(targetGeom.getExtent(), zoomLevels, getBasemapTileInfo(), true);
    def.resolve(exts);
  })();

  return def;
}

function getExtentsForGeometry(targetGeom, zoomLevels) {
  var def = new dojo.Deferred();

  (function () {
    var exts = getExtentsForGeomExtentWithTileInfo(targetGeom.getExtent(), zoomLevels, getBasemapTileInfo(), false);
    def.resolve(exts);
  })();

  return def;
}

function getBasemapTileInfo() {
  var map = __appState().map;
  return map.getLayer(map.basemapLayerIds[0]).tileInfo;
}

function getExtentsForGeomExtentWithTileInfo(extent, zoomLevels, tileInfo, countOnly) {
  var selectedLODs = [];

  for (var i=0; i<tileInfo.lods.length; i++) {
    if (zoomLevels.indexOf(tileInfo.lods[i].level) !== -1) {
      selectedLODs.push(tileInfo.lods[i]);
    }
  }

  var tilesByZoomLevel = {};
  
  for (var lodIndex=0; lodIndex < selectedLODs.length; lodIndex++) {
    var currentLOD = selectedLODs[lodIndex];

    var tileWidth = tileInfo.width * currentLOD.resolution,
        tileHeight = tileInfo.height * currentLOD.resolution;

    var minCol = Math.floor((extent.xmin - tileInfo.origin.x) / tileWidth),
        minRow = Math.floor(-(extent.ymax - tileInfo.origin.y) / tileHeight),
        maxCol = Math.ceil((extent.xmax - tileInfo.origin.x) / tileWidth),
        maxRow = Math.ceil(-(extent.ymin - tileInfo.origin.y) / tileHeight);

    var extents = [];

    if (!countOnly) {
      for (var c=minCol; c < maxCol; c++) {
        for (var r=minRow; r < maxRow; r++) {
          extents.push({
            xmin: tileInfo.origin.x + (c * tileWidth), 
            ymin: tileInfo.origin.y - ((r+1) * tileHeight),
            xmax: tileInfo.origin.x + ((c+1) * tileWidth), 
            ymax: tileInfo.origin.y - (r * tileHeight),
            row: r,
            column: c
          });
        }
      }
    } else {
      extents = {
        bbox: {
          xmin: tileInfo.origin.x + (minCol * tileWidth), 
          ymin: tileInfo.origin.y - ((maxRow+1) * tileHeight),
          xmax: tileInfo.origin.x + ((maxCol+1) * tileWidth), 
          ymax: tileInfo.origin.y - (minRow * tileHeight)
        },
        rows: maxRow - minRow,
        columns: maxCol - minCol,
        count: (maxCol-minCol) * (maxRow-minRow)
      };
    }
    tilesByZoomLevel[currentLOD.level] = extents;
  }

  return tilesByZoomLevel;
}

function getTileGraphicsForGeometry(targetGeom, zoomLevels) {
  var def = new dojo.Deferred();

  require(['esri/geometry/Extent', 'esri/graphic'], function (Extent, Graphic) {
    getExtentsForGeometry(targetGeom, zoomLevels)
      .then(function (tileExtents) {
        var newGraphics = [],
            count = 0;
          
        for (var zoomLevel in tileExtents) {
          var extentsForZoom = tileExtents[zoomLevel];
          console.log(extentsForZoom.length + ' tiles for zoom level ' + zoomLevel);
          count += extentsForZoom.length;

          for (var i=0; i<extentsForZoom.length; i++) {
            var e = extentsForZoom[i],
                tileExtent = new Extent(e.xmin, e.ymin, e.xmax, e.ymax, targetGeom.spatialReference),
                tileGraphic = new Graphic(tileExtent, undefined, {
                  row: e.row,
                  column: e.column,
                  zoom: zoomLevel
                });
            newGraphics.push(tileGraphic);
          }
        }

        console.log(count + ' total tiles.');

        def.resolve(newGraphics);
      });
  });

  return def;
}
