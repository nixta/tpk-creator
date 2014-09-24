var detailLevels = [13,14,15,16],
    midLevels = [10,11,12],
    overviewLevels = [5,6,7,8,9],
    globalLevels = [1,2,3,4],
    maxEstimateCount = 100000;

function initializeUI() {
  $('#zoomLevels button').on('click', function () {
    $(this).tooltip('hide');
    saveSelectedLevels(this);
    invalidateEstimate();
  });

  $('#zoomLevels button').tooltip({
    title: function() {
      var c = $(this).attr('data-tile-count'),
          p = parseInt(c) === 1?'':'s';
      return c + ' tile' + p;
    }
  });

  $('#estimateButton').tooltip();

  var savedButtons = $.cookie('selectedLevels');
  if (savedButtons !== undefined) {
    for (var i=0; i<savedButtons.length; i++) {
      buttonForLevel(savedButtons[i]).addClass('active');
    }
  }
}

function showEstimatedTileCount() {
  var map = __appState().map;
  var geomToEstimate = map.extent;
  var selected = getSelectedLevels();
  var currentTileCount = parseInt($('#zoomLevels').attr('data-tile-count'));
  getExtentCountsForGeometry(geomToEstimate, selected)
    .then(function (tileExtents) {
      var count = 0;
      $('#zoomLevels button').attr('data-tile-count', 0);

      for (var zoomLevel in tileExtents) {
        var tileCountForZoomLevel = tileExtents[zoomLevel].count;
        buttonForLevel(zoomLevel).attr('data-tile-count', tileCountForZoomLevel);
        count += tileCountForZoomLevel;
      }

      if (count !== currentTileCount) {
        invalidateEstimate();
      }

      $('#zoomLevels').attr('data-tile-count', count);
      
      var countStr = (''+count).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
      $('#tileCountDisplay').text(countStr + ' tile' + (count!==1?'s':''));
      setEstimateButtonEnabled();
    });
}

function showCurrentZoom() {
  $('#zoomLevels > button').removeClass('current-zoom');
  buttonForLevel(__appState().map.getZoom()).addClass('current-zoom');
}

function buttonForLevel(level) {
  return $('#zoomLevels button[data-zoom-level="' + level + '"]');
}

function invalidateEstimate() {
  $('#tpkSizeDisplay').addClass('invalid');
}

function estimateTPK() {

  if (__appState().portalUser === undefined) {
    alert('You must authorize the app!');
    return;
  }

  var geomToEstimate = __appState().map.extent,
      levelsToUse = getSelectedLevels();

  // showTilesOnMap(geomToEstimate, levelsToUse);
  makeEstimateRequest.bind(this)(geomToEstimate, levelsToUse);
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

function makeEstimateRequest(geomToEstimate, levelsToUse) {
  console.log('Estimating for levels:');
  console.log(levelsToUse);

  setTileSizeText(-1);
  var l = Ladda.create($('#estimateButton')[0]);
  l.start();
  $('#estimateButton').tooltip('hide');
  // $('#estimateButton').disable(true);
  requestTPKEstimate(geomToEstimate, levelsToUse)
    .then(function gotEstimate(estimate) {
      console.log('Got estimate: ' + estimate.totalTilesToExport + ' tiles in ' + estimate.totalSize/1024/1024 + 'Mb');
      setTileSizeText(estimate.totalSize);
      // $('#estimateButton').disable(false);
      l.stop();
    }, function estimateFailed(err) {
      console.error('Failed to get estimate:');
      console.log(JSON.stringify(err, null, '  '));
      setTileSizeText('Failed to get estimate!');
      // $('#estimateButton').disable(false);
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
  return $.makeArray($('#zoomLevels button.active').map(function(i, v) { 
    return parseInt($(v).attr('data-zoom-level'));
  }));
}

function saveSelectedLevels(clickedButton) {
  window.setTimeout(function () {
    var selected = getSelectedLevels();
    $.cookie('selectedLevels', selected, {expires: 365});
    showEstimatedTileCount();
    $(clickedButton).tooltip('show');
  }, 100);
  $(this).blur();
}

function setEstimateButtonEnabled() {
  var count = parseInt($('#zoomLevels').attr('data-tile-count'));
  $('#estimateButton').disable((count === 0) ||
                             (count > maxEstimateCount) ||
                             (__appState().portalUser === undefined));
}
