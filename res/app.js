var detailLevels = [13,14,15,16],
    midLevels = [10,11,12],
    overviewLevels = [5,6,7,8,9],
    globalLevels = [1,2,3,4],
    maxEstimateCount = 100000;

var basemaps = {
  topo: {
    basicURL: 'http://services.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer',
    tilePackageURL: 'http://tiledbasemaps.arcgis.com/arcgis/rest/services/World_Topo_Map/MapServer'
  }
};

jQuery.fn.extend({
    disable: function(state) {
        return this.each(function() {
            this.disabled = state;
        });
    }
});

$(document).ready(function () {
  $.cookie.json = true;

  $('body').data('esri-gnip-translator', {
    clientId: 'ycUvqwhnMGffespX',
    jobs: {}
  });

  initAuthenticationState();
  initializeUI();
  initializeMap();
});


function __appState() {
  return $('body').data('esri-gnip-translator');
}

function initializeMap() {
  createMap('extentMap', function (theMap) {
    __appState().map = theMap;
    theMap.getLayer(theMap.basemapLayerIds[0]).on('load', showEstimatedTileCount);

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
      theMap.on('load', function () {
        theMap.on('extent-change', showEstimatedTileCount);
        showCurrentZoom();
      });
      theMap.on('zoom-end', showCurrentZoom);
    });
  });
}

function showCurrentZoom() {
  $('#zoomLevels > button').removeClass('current-zoom');
  $('#zoomLevels > button[data-zoom-level="' + __appState().map.getZoom() + '"]').addClass('current-zoom');
}

function estimateTPK() {
  var geomToEstimate = __appState().map.extent,
      levelsToUse = getSelectedLevels();

  console.log('Estimating for levels:');
  console.log(levelsToUse);

  // getTilesForGeometry(geomToEstimate, levelsToUse)
  //   .then(function (newGraphics) {
  //     var tileDisplayLayer = __appState().tileDisplayLayer;
  //     tileDisplayLayer.clear();

  //     console.log('Got ' + newGraphics.length + ' graphics!');

  //     if (newGraphics.length < 6000) {
  //       for (var i=0; i<newGraphics.length; i++) {
  //         tileDisplayLayer.add(newGraphics[i]);
  //       }    
  //     } else {
  //       console.log('That\'s too many graphics to add. Won\'t bother');
  //     }
  //   });

  setTileSizeText(-1);
  requestEstimate(geomToEstimate, levelsToUse)
    .then(function gotEstimate(estimate) {
      console.log('Got estimate: ' + estimate.totalTilesToExport + ' tiles in ' + estimate.totalSize/1024/1024 + 'Mb');
      setTileSizeText(estimate.totalSize);
    }, function estimateFailed(err) {
      console.error('Failed to get estimate:');
      console.log(JSON.stringify(err, null, '  '));
      setTileSizeText('Failed to get estimate!');
    });
}

function setTileSizeText(size) {
  var str = '';
  if ({}.toString.call(size) === '[object String]') {
    str = size;
  } else if (size === -1) {
    str = 'Calculating size...';
  } else {
    str = (Math.round(1000*(size/1024/1024))/1000) + 'Mb';
  }
  if (str !== '') {
    str = '(' + str + ')';
  }
  $('#tpkSizeDisplay').text(str);
  $('#tpkSizeDisplay').removeClass('invalid');
}

function invalidateEstimate() {
  $('#tpkSizeDisplay').addClass('invalid');
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

function getExtentsForGeometry(targetGeom, zoomLevels) {
  var def = new dojo.Deferred();

  var map = __appState().map,
      basemapIds = map.basemapLayerIds,
      tileLayer = map.getLayer(basemapIds[0]),
      tileInfo = tileLayer.tileInfo;

  return getExtentCountsForGeomWithTileInfo(targetGeom, zoomLevels, tileInfo);
}

function getExtentsForGeomWithTileInfo(targetGeom, zoomLevels, tileInfo) {
  var def = new dojo.Deferred();

  (function () {
    var exts = getExtentsForGeomExtentWithTileInfo(targetGeom.getExtent(), zoomLevels, tileInfo, false);
    def.resolve(exts);
  })();

  return def;
}

function getExtentCountsForGeomWithTileInfo(targetGeom, zoomLevels, tileInfo) {
  var def = new dojo.Deferred();

  (function () {
    var exts = getExtentsForGeomExtentWithTileInfo(targetGeom.getExtent(), zoomLevels, tileInfo, true);
    def.resolve(exts);
  })();

  return def;
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
      extents = (maxCol-minCol-1) * (maxRow-minRow-1); 
    }
    tilesByZoomLevel[currentLOD.level] = extents;
  }

  return tilesByZoomLevel;
}


function getTilesForGeometry(targetGeom, zoomLevels) {
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

function getSelectedLevels() {
  return $.makeArray($('#zoomLevels button.active').map(function(i, v) { 
    return parseInt($(v).attr('data-zoom-level'));
  }));
}

function initializeUI() {
  $('#zoomLevels button').on('click', function () {
    saveButtons();
    invalidateEstimate();
  });
  $('#zoomLevels button').tooltip({
    title: function() {
      var zl = $(this).attr('data-tile-count'),
          p = parseInt(zl) === 1?'':'s';
      return zl + ' tile' + p;
    }
  });
  $('#estimateButton').tooltip();
  var savedButtons = $.cookie('selectedLevels');
  if (savedButtons !== undefined) {
    for (var i=0; i<savedButtons.length; i++) {
      $('#zoomLevels button[data-zoom-level="' + savedButtons[i] + '"]').addClass('active');
    }
  }
}

function showEstimatedTileCount() {
  var map = __appState().map;
  var geomToEstimate = map.extent;
  var selected = getSelectedLevels();
  getExtentsForGeometry(geomToEstimate, selected)
    .then(function (tileExtents) {
      var count = 0;
      $('#zoomLevels button').attr('data-tile-count', 0);

      for (var zoomLevel in tileExtents) {
        var tileCountForZoomLevel = tileExtents[zoomLevel];
        $('#zoomLevels button[data-zoom-level="' + zoomLevel + '"').attr('data-tile-count', tileCountForZoomLevel);
        count += tileCountForZoomLevel;
      }
      
      var countStr = (''+count).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
      $('#tileCountDisplay').text(countStr + ' tile' + (count!==1?'s':''));
      $('#estimateButton').disable(count > maxEstimateCount);
    });
}

function saveButtons() {
  window.setTimeout(function () {
    var selected = getSelectedLevels();
    $.cookie('selectedLevels', selected, {expires: 365});
    showEstimatedTileCount();
  }, 100);
  $(this).blur();
}
