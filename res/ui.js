var detailLevels = [13,14,15,16],
    midLevels = [10,11,12],
    overviewLevels = [5,6,7,8,9],
    globalLevels = [1,2,3,4],
    maxEstimateCount = 100000;

function initializeUI() {

  var selectedLevels = $.cookie('selectedLevels'),
      rangeLimits = [];
  if (selectedLevels === undefined) {
    selectedLevels = [13,14,15];
  }

  __appState().selectedLevels = selectedLevels;

  rangeLimits = [selectedLevels[0],selectedLevels[selectedLevels.length-1]];

  $('#zoomLevelsSlider').slider({
    orientation: 'horizontal',
    range: true,
    min: 0,
    max: 19,
    step: 1,
    values: rangeLimits,
    start: function(e, ui) {
      $(ui.handle).siblings('.ui-slider-handle').addBack().tooltip('show');
    },
    stop: function (e, ui) {
      $(ui.handle).siblings('.ui-slider-handle').addBack().tooltip('hide');
    },
    slide: function(e, ui) {
      $(ui.handle).attr('data-handle-slider-value', ui.value);
      window.setTimeout(function () {
        updateZoomLevels(e, ui);
        $(ui.handle).tooltip('show');
      }, 0);
    },
    create: function (e, ui) {
      $(e.target).find('.ui-slider-handle')
        .attr('data-toggle','tooltip')
        .tooltip({
          animation: false,
          container: 'body',
          placement: function() {
            return this.$element.index('.ui-slider-handle') === 0?'top':'bottom';
          },
          trigger: 'manual',
          title: function () {
            return $(this).attr('data-handle-slider-value');
          }
        });
    }
  });

  $('#estimateButton').tooltip();
  $('#tpkButton').tooltip();

  var $basemapDropdown = $('#basemapDropdown');
  for (var basemapType in basemaps) {
    var basemap = basemaps[basemapType],
        $picker = $('<li role="presentation"><a role="menuitem" tabindex="-1" data-basemap="' + basemapType + '" href="#" onClick="changeBasemap()">' + basemap.name + '</a></li>');
    $basemapDropdown.append($picker);
  }

  showTPKInfo();
}

function updateZoomLevels(e, ui) {
  saveSelectedLevels();

  showTPKInfo();
}

function showTPKInfo() {
  var zLevels = __appState().selectedLevels;
  $('#zoomLevelsRange').text('Levels ' + zLevels[0] + '-' + zLevels[zLevels.length-1]);

  showEstimatedTileCount();
}

function changeBasemap() {
  __appState().map.setBasemap($(this.event.toElement).attr('data-basemap'));
}

function basemapChanged() {
  var map = __appState().map,
      newBasemap = map.getBasemap();
  $('#basemapDropdown li').removeClass('active');
  $('#basemapDropdown li a[data-basemap="' + newBasemap + '"]').parent().addClass('active');
  $('#currentBasemap').text(basemaps[newBasemap].name);

  var basemapTileInfo = getBasemapTileInfo();
  $('#zoomLevels button').disable(true);

  for (var i=0; i<basemapTileInfo.lods.length; i++) {
    $('#zoomLevels button[data-zoom-level="' + basemapTileInfo.lods[i].level + '"]').disable(false);
  }

  showEstimatedTileCount();
}

function showEstimatedTileCount() {
  var map = __appState().map;
  if (map) {
    var geomToEstimate = map.extent,
        selected = getSelectedLevels(),
        currentTileCount = parseInt($('#tpkInfo').attr('data-tile-count'));
        
    getExtentCountsForGeometry(geomToEstimate, selected)
      .then(function (tileExtents) {
        var count = 0;

        for (var zoomLevel in tileExtents) {
          var tileCountForZoomLevel = tileExtents[zoomLevel].count;
          count += tileCountForZoomLevel;
        }

        if (count !== currentTileCount) {
          invalidateEstimate();
        }

        $('#tpkInfo').attr('data-tile-count', count);
        
        var countStr = (''+count).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
        $('#tileCountDisplay').text(countStr + ' tile' + (count!==1?'s':''));
        setTpkButtonsEnabled();
      });
  } else {
    $('#tileCountDisplay').text('Waiting for map to load...');
  }
}

function showCurrentZoom() {
  // $('#zoomLevels > button').removeClass('current-zoom');
  // buttonForLevel(__appState().map.getZoom()).addClass('current-zoom');
}

// function buttonForLevel(level) {
//   return $('#zoomLevels button[data-zoom-level="' + level + '"]');
// }

function invalidateEstimate() {
  $('#tpkSizeDisplay').addClass('invalid');
}

function estimateTPK() {
  if (__appState().portalUser === undefined) {
    alert('You must authorize the app!');
    return;
  }

  var basemapType = __appState().map.getBasemap(),
      geomToEstimate = __appState().map.extent,
      levelsToUse = getSelectedLevels();

  // showTilesOnMap(geomToEstimate, levelsToUse);
  makeEstimateRequest.bind(this)(basemapType, geomToEstimate, levelsToUse);
}

function getTPK() {
  if (__appState().portalUser === undefined) {
    alert('You must authorize the app!');
    return;
  }

  var basemapType = __appState().map.getBasemap(),
      geom = __appState().map.extent,
      levelsToUse = getSelectedLevels();

  makeTpkRequest.bind(this)(basemapType, geom, levelsToUse);
}

function showTilesOnMap(geomToEstimate, levelsToUse) {
  getTileGraphicsForGeometry(geomToEstimate, levelsToUse)
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
}

function makeEstimateRequest(basemapType, geomToEstimate, levelsToUse) {
  console.log('Estimating for levels:');
  console.log(levelsToUse);

  setTileSizeText(-1);
  var l = Ladda.create($('#estimateButton')[0]);
  l.start();
  $('#estimateButton').tooltip('hide');
  requestTPKEstimate(basemapType, geomToEstimate, levelsToUse)
    .then(function gotEstimate(estimate) {
      console.log('Got estimate: ' + estimate.totalTilesToExport + ' tiles in ' + estimate.totalSize/1024/1024 + 'Mb');
      setTileSizeText(estimate.totalSize);
      l.stop();
    }, function estimateFailed(err) {
      console.error('Failed to get estimate:');
      console.log(JSON.stringify(err, null, '  '));
      setTileSizeText('Failed to get estimate!');
      l.stop();
    });
}

function makeTpkRequest(basemapType, geom, levelsToUse) {
  console.log('Generating TPK for levels:');
  console.log(levelsToUse);

  var l = Ladda.create($('#tpkButton')[0]);
  l.start();
  $('#tpkButton').tooltip('hide');
  requestTPK(basemapType, geom, levelsToUse)
    .then(function gotTpk(tpkUrl) {
      console.log('Got tpk: ' + tpkUrl);
      l.stop();
      $('#downloadTPK').attr('href', tpkUrl).fadeIn().css('display','inline-block');
    }, function tpkFailed(err) {
      console.error('Failed to get tpk:');
      console.log(JSON.stringify(err, null, '  '));
      l.stop();
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

function getSelectedLevels() {
  var range = $('#zoomLevelsSlider').slider('values'),
      values = [];
  for (var i = range[0]; i <= range[1]; i++) {
    values.push(i);
  }
  return values;
}

function loadSelectedLevels() {

}

function saveSelectedLevels() {
  var selected = __appState().selectedLevels = getSelectedLevels();
  $.cookie('selectedLevels', selected, {expires: 365});
  showEstimatedTileCount();
}

function setTpkButtonsEnabled() {
  var count = parseInt($('#zoomLevels').attr('data-tile-count'));
  var disabled = (count === 0) ||
                 (count > maxEstimateCount) ||
                 (__appState().portalUser === undefined);
  $('#estimateButton').disable(disabled);
  $('#tpkButton').disable(disabled);
}

jQuery.fn.extend({
    disable: function(state) {
        return this.each(function() {
            this.disabled = state;
        });
    }
});
