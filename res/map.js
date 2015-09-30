var maps = {};

var defaultMapPosition = { center: [-122.45,37.77], zoom: 13 },
    defaultBasemap = 'topo';

function createMap(mapId, callback) {
  if (!maps.hasOwnProperty(mapId)) {
    require(["application/bootstrapmap", "dojo/domReady!"], 
      function(BootstrapMap) {
        var basemap = $.cookie('selectedBasemap') || defaultBasemap,
            mapPosition = $.cookie('mapPosition') || defaultMapPosition;
        // Get a reference to the ArcGIS Map class
        maps[mapId] = BootstrapMap.create(mapId,{
          basemap: basemap,
          center: mapPosition.center,
          zoom: mapPosition.zoom,
          scrollWheelZoom: false,
          showAttribution: true
        });
        callback(maps[mapId]);
    });
  } else {
    callback(maps[mapId]);
  }
}

function initializeMap() {
  createMap('extentMap', function (theMap) {
    __appState().map = theMap;
    theMap.getLayer(theMap.basemapLayerIds[0]).on('load', showEstimatedTileCount);

    require(['esri/layers/GraphicsLayer',
             'esri/symbols/SimpleLineSymbol', 
             'esri/symbols/SimpleFillSymbol', 
             'esri/renderers/SimpleRenderer',
             "esri/dijit/Search",
             'esri/Color'], 
      function (GraphicsLayer, SimpleLineSymbol, SimpleFillSymbol, SimpleRenderer, Search, Color) {
      var newLayer = new GraphicsLayer(),
          tileOutline = new SimpleLineSymbol(SimpleLineSymbol.STYLE_SOLID, new Color([255,0,0,0.5]), 0.5),
          tileFill = new SimpleFillSymbol(SimpleFillSymbol.STYLE_NULL,
            tileOutline,
            new Color([0,200,0,0.5]));
      newLayer.renderer = new SimpleRenderer(tileFill);
      __appState().tileDisplayLayer = newLayer;
      theMap.addLayer(newLayer);
      theMap.on('load', function () {
        theMap.on('extent-change', function() {
          showEstimatedTileCount();
          var center = theMap.extent.getCenter();
          $.cookie('mapPosition', {
            center: [center.getLongitude(), center.getLatitude()],
            zoom: theMap.getZoom()
          });
        });
        theMap.on('basemap-change', basemapChanged);
        basemapChanged();
        showCurrentZoom();
        showTPKInfo();
      });

      var s = new Search({
        map: theMap
      }, "search");
      s.startup();

      theMap.on('zoom-end', showCurrentZoom);
    });
  });
}

function getBasemapTileInfo() {
  var map = __appState().map;
  return map.getLayer(map.basemapLayerIds[0]).tileInfo;
}
