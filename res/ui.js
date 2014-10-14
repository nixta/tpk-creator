var detailLevels = [13,14,15,16],
    midLevels = [10,11,12],
    overviewLevels = [5,6,7,8,9],
    globalLevels = [1,2,3,4],
    maxEstimateCount = 100000;

function initializeUI() {
  initializeRangeSlider();

  $('#estimateButton').tooltip();
  $('#tpkButton').tooltip();

  // Load up the basemap picker
  var $basemapDropdown = $('#basemapDropdown');
  for (var basemapType in basemaps) {
    var basemap = basemaps[basemapType],
        $picker = $('<li role="presentation"><a role="menuitem" tabindex="-1" data-basemap="' + basemapType + '" href="#" onClick="changeBasemap()">' + basemap.name + '</a></li>');
    $basemapDropdown.append($picker);
  }

  showTPKInfo();
}


/// Range selection
function initializeRangeSlider() {
  // Load stored zoom level range if need be
  var selectedLevels = $.cookie('selectedLevels'),
      rangeLimits = [];
  if (selectedLevels === undefined) {
    selectedLevels = midLevels;
  }

  __appState().selectedLevels = selectedLevels;

  rangeLimits = [selectedLevels[0],selectedLevels[selectedLevels.length-1]];

  // Set up the jQuery UI zoom slider
  $('#zoomLevelsSlider').dragslider({
    orientation: 'horizontal',
    range: true,
    rangeDrag: true,
    min: 0,
    max: 19,
    step: 1,
    values: rangeLimits,
    start: function(e, ui) {
      // When we start dragging any handle, show selected range
      showInteractionHeading();
    },
    stop: function (e, ui) {
      // When we stop dragging any handle, hide selected range
      hideInteractionHeading();
    },
    slide: function(e, ui) {
      if (ui.range) {
        // Dragging the whole range.
        window.setTimeout(function () {
          // slide happens BEFORE the slider is updated, so we'll drop back into the event queue
          updateZoomLevels(e, ui);
        }, 0);        
      } else {
        // As we move things around, update the selected range.
        window.setTimeout(function () {
          // slide happens BEFORE the slider is updated, so we'll drop back into the event queue
          updateZoomLevels(e, ui);
        }, 0);        
      }
    }
  });
}

function showInteractionHeading() {
  setPanelHeading(true);
}

function hideInteractionHeading() {
  setPanelHeading(false);
}

function setPanelHeading(showInteraction) {
  var $defaultPanel     = $('#tpkPanel .panel-heading.default'),
      $interactionPanel = $('#tpkPanel .panel-heading.interaction'),
      $panelToShow      = showInteraction?$interactionPanel:$defaultPanel,
      $panelToHide      = showInteraction?$defaultPanel:$interactionPanel;

  // jQuery Queues. Oh yeah! So, if I just tap on the slider, I might try
  // to initiate a fade-out animation on the interaction panel while it's still
  // fading in. By putting everything on the same queue, and only progressing the
  // queue when our pair of fade-in + fade-out animations have completed, we
  // ensure that even a fade-out during a fade-in will wait its turn.
  $('#tpkPanel').queue(function() {
    $panelToHide.fadeOut({
      duration: 'fast',
      complete: function () {
        $panelToShow.fadeIn({
          duration: 'fast',
          complete: function() {
            // Now allow any waiting fade-out/in pair to go ahead.
            $('#tpkPanel').dequeue();
          }
        });
      }
    });
  });
}


/// Basemap Picker
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

  $.cookie('selectedBasemap', newBasemap, {expires: 365});
}


/// TPK Feedback and calculations
function showTPKInfo() {
  var zLevels = __appState().selectedLevels,
      rangeString = zLevels[0] + ' - ' + zLevels[zLevels.length-1];
  $('#zoomLevelsRange').text('Levels ' + rangeString);

  $('#tpkPanel .panel-heading.interaction span').text(rangeString);

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

function setTpkButtonsEnabled() {
  var count = parseInt($('#tpkInfo').attr('data-tile-count'));
  var disabled = (count === 0) ||
                 (count > maxEstimateCount) ||
                 (__appState().portalUser === undefined);
  $('#estimateButton').disable(disabled);
  $('#tpkButton').disable(disabled);
}



/// Handle zoom change
function updateZoomLevels(e, ui) {
  saveSelectedLevels();
  showTPKInfo();
}

function showCurrentZoom() {
  // Placeholder
  console.log('Current map zoom: ' + __appState().map.getZoom());
}



/// Estimating TPKs
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

function invalidateEstimate() {
  $('#tpkSizeDisplay').addClass('invalid');
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



/// Creating TPKs
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



/// Selected Levels
function getSelectedLevels() {
  var range = $('#zoomLevelsSlider').dragslider('values'),
      values = [];
  for (var i = range[0]; i <= range[1]; i++) {
    values.push(i);
  }
  return values;
}

function saveSelectedLevels() {
  var selected = __appState().selectedLevels = getSelectedLevels();
  $.cookie('selectedLevels', selected, {expires: 365});
  showEstimatedTileCount();
}


function showTiles() {
  var ext = __appState().map.extent,
      lods = getSelectedLevels();
  showTilesOnMap(ext, lods);
}


/// Visual Feedback
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



/// jQuery shortcut for disabling elements
jQuery.fn.extend({
    disable: function(state) {
        return this.each(function() {
            this.disabled = state;
        });
    }
});
