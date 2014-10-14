var maps = {};

function createMap(mapId, callback) {
  if (!maps.hasOwnProperty(mapId)) {
    require(["application/bootstrapmap", "dojo/domReady!"], 
      function(BootstrapMap) {
        // Get a reference to the ArcGIS Map class
        maps[mapId] = BootstrapMap.create(mapId,{
          basemap:"topo",
          center:[-122.45,37.77],
          zoom:13,
          scrollWheelZoom: false
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
        theMap.on('basemap-change', basemapChanged);
        basemapChanged();
        showCurrentZoom();
        showTPKInfo();
      });
      theMap.on('zoom-end', showCurrentZoom);
    });
  });
}

function getBasemapTileInfo() {
  var map = __appState().map;
  return map.getLayer(map.basemapLayerIds[0]).tileInfo;
}
