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
