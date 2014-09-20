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
  }
}