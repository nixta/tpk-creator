var detailLevels = [13,14,15,16],
    midLevels = [10,11,12],
    overviewLevels = [5,6,7,8,9],
    globalLevels = [1,2,3,4];

var basemaps = {
  topo: {
    basicURL: 'http://services.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer',
    tilePackageURL: 'http://tiledbasemaps.arcgis.com/arcgis/rest/services/World_Topo_Map/MapServer'
  }
};

$(document).ready(function () {
  $('body').data('esri-gnip-translator', {
    clientId: 'ycUvqwhnMGffespX',
    jobs: {}
  });

  initAuthenticationState();
  initializeMap();
});


function __appState() {
  return $('body').data('esri-gnip-translator');
}

function initializeMap() {
  createMap('extentMap', function (theMap) {
    __appState().map = theMap;
    require(['esri/layers/GraphicsLayer',
             'esri/symbols/SimpleLineSymbol', 
             'esri/symbols/SimpleFillSymbol', 
             'esri/renderers/SimpleRenderer',
             'esri/Color'], 
      function (GraphicsLayer, SimpleLineSymbol, SimpleFillSymbol, SimpleRenderer, Color) {
      var newLayer = new GraphicsLayer(),
          tileOutline = new SimpleLineSymbol(SimpleLineSymbol.STYLE_SOLID, new Color([255,0,0,0.5]), 0.5),
          tileFill = new SimpleFillSymbol(SimpleFillSymbol.STYLE_NULL,
            tileOutline,
            new Color([0,200,0,0.5]));
      newLayer.renderer = new SimpleRenderer(tileFill);
      __appState().tileDisplayLayer = newLayer;
      theMap.addLayer(newLayer);
    });
  });
}

function estimateTPK() {
  var geomToEstimate = __appState().map.extent,
      levelsToUse = detailLevels;

  getTilesForGeometry(geomToEstimate, levelsToUse)
  .then(function (newGraphics) {
    var tileDisplayLayer = __appState().tileDisplayLayer;
    tileDisplayLayer.clear();

    console.log('Got ' + newGraphics.length + ' graphics!');

    if (newGraphics.length < 6000) {
      for (var i=0; i<newGraphics.length; i++) {
        tileDisplayLayer.add(newGraphics[i]);
      }    
    } else {
      console.log('That\'s too many graphics to add. Won\'t bother');
    }
  });

  requestEstimate(geomToEstimate, levelsToUse)
  .then(function gotEstimate(estimate) {
    console.log('Got estimate: ' + estimate.totalTilesToExport + ' tiles in ' + estimate.totalSize/1024/1024 + 'Mb');
  }, function estimateFailed(err) {
    console.error('Failed to get estimate:');
    console.log(JSON.stringify(err, null, '  '));
  });
}

function requestEstimate(targetGeom, zoomLevels) {
  var def = new dojo.Deferred();

  var user = __appState().portalUser;
  if (user === undefined) {
    console.error('Not logged in!');
    return;
  }

  var requestData = {
    tilePackage: true,
    exportBy: 'LevelID',
    exportExtent: JSON.stringify(targetGeom.toJson()),
    token: user.credential.token,
    levels: zoomLevels.join(),
    f: 'json'
  };

  var estimateURL = basemaps.topo.tilePackageURL + '/estimateExportTilesSize';

  function pollJob(jobId) {
    var statusURL = estimateURL + '/jobs/' + jobId,
        pollRequestData = {
          token: requestData.token,
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

  $.post(estimateURL, requestData, null, 'json')
    .done(function estimateRequestPostedOK(estimateData) {
      var jobId = estimateData.jobId;

      __appState().jobs[jobId] = {
        status: estimateData.jobStatus,
        lastChecked: new Date(),
        pollingId: window.setInterval(function () {
          pollJob(jobId);
        }, 2000)
      };
    })
    .fail(function (err) {
      console.error('Unable to request estimate');
      console.log(err);
    });

  return def;
}

function getTilesForGeometry(targetGeom, zoomLevels) {
  var def = new dojo.Deferred();

  var map = __appState().map,
      basemapIds = map.basemapLayerIds,
      tileLayer = map.getLayer(basemapIds[0]),
      tileInfo = tileLayer.tileInfo;

  var selectedLODs = [];
  for (var i=0; i<tileInfo.lods.length; i++) {
    if (zoomLevels.indexOf(tileInfo.lods[i].level) !== -1) {
      selectedLODs.push(tileInfo.lods[i]);
    }
  }

  if (selectedLODs.length === 0) {
    throw new Error('Could not find current LOD for ' + zoomLevels);
  }

  var extent = targetGeom.getExtent();
  console.log(JSON.stringify(extent.toJson()));
  console.log(zoomLevels);

  require(['esri/geometry/Extent', 'esri/graphic'], function (Extent, Graphic) {
    var newGraphics = [];

    for (var lodIndex=0; lodIndex < selectedLODs.length; lodIndex++) {
      var currentLOD = selectedLODs[lodIndex];

      console.log('Calculating for LOD ' + currentLOD.level);

      var tileWidth = tileInfo.width * currentLOD.resolution,
          tileHeight = tileInfo.height * currentLOD.resolution;

      var minCol = Math.floor((extent.xmin - tileInfo.origin.x) / tileWidth),
          minRow = Math.floor(-(extent.ymax - tileInfo.origin.y) / tileHeight),
          maxCol = Math.ceil((extent.xmax - tileInfo.origin.x) / tileWidth),
          maxRow = Math.ceil(-(extent.ymin - tileInfo.origin.y) / tileHeight);

      var count = 0;

      for (var c=minCol; c < maxCol; c++) {
        for (var r=minRow; r < maxRow; r++) {
          var tileExtent = new Extent(tileInfo.origin.x + (c * tileWidth), 
            tileInfo.origin.y - ((r+1) * tileHeight),
            tileInfo.origin.x + ((c+1) * tileWidth), 
            tileInfo.origin.y - (r * tileHeight),
            extent.spatialReference);
          count++;
          var tileGraphic = new Graphic(tileExtent, undefined, {
            row: r,
            column: c,
            zoom: currentLOD.level
          });
          newGraphics.push(tileGraphic);
        }
      }

      console.log('Create ' + count + ' graphics for zoom level ' + currentLOD.level);
    }

    def.resolve(newGraphics);
  });

  return def;
}