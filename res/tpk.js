var basemaps = {
  topo: {
    name: 'Topographic',
    basicURL: 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer',
    tilePackageURL: 'https://tiledbasemaps.arcgis.com/arcgis/rest/services/World_Topo_Map/MapServer'
  },
  streets: {
    name: 'World Streets',
    basicURL: 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer',
    tilePackageURL: 'https://tiledbasemaps.arcgis.com/arcgis/rest/services/World_Street_Map/MapServer'
  },
  'national-geographic': {
    name: 'National Geographic',
    basicURL: 'https://services.arcgisonline.com/ArcGIS/rest/services/NatGeo_World_Map/MapServer',
    tilePackageURL: 'https://tiledbasemaps.arcgis.com/arcgis/rest/services/NatGeo_World_Map/MapServer'
  },
  oceans: {
    name: 'Oceans',
    basicURL: 'https://services.arcgisonline.com/ArcGIS/rest/services/Ocean_Basemap/MapServer',
    tilePackageURL: 'https://tiledbasemaps.arcgis.com/arcgis/rest/services/Ocean_Basemap/MapServer'
  },
  satellite: {
    name: 'Satellite Imagery',
    basicURL: 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer',
    tilePackageURL: 'https://tiledbasemaps.arcgis.com/arcgis/rest/services/World_Imagery/MapServer'
  },
  gray: {
    name: 'Light Gray Canvas',
    basicURL: 'https://services.arcgisonline.com/arcgis/rest/services/Canvas/World_Light_Gray_Base/MapServer',
    tilePackageURL: 'https://tiledbasemaps.arcgis.com/arcgis/rest/services/Canvas/World_Light_Gray_Base/MapServer'
  },
  'dark-gray': {
    name: 'Dark Gray Canvas',
    basicURL: 'https://services.arcgisonline.com/arcgis/rest/services/Canvas/World_Dark_Gray_Base/MapServer',
    tilePackageURL: 'https://tiledbasemaps.arcgis.com/arcgis/rest/services/Canvas/World_Dark_Gray_Base/MapServer'
  }
};

function requestTPKEstimate(basemap, targetGeom, zoomLevels) {
  var user = __appState().portalUser;
  if (user === undefined) {
    console.error('Not logged in!');
    return;
  }

  return performTPKOperation(basemap, targetGeom, zoomLevels, user.credential.token, true);
}

function requestTPK(basemap, targetGeom, zoomLevels) {
  var def = new dojo.Deferred();

  var user = __appState().portalUser;
  if (user === undefined) {
    console.error('Not logged in!');
    return;
  }

  performTPKOperation(basemap, targetGeom, zoomLevels, user.credential.token, false)
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

function pollJobStatus(def, token, functionUrl, jobId) {
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
  console.log(url);

  $.post(url, requestData, null, 'json')
    .done(function estimateRequestPostedOK(jobJSON) {
      var jobId = jobJSON.jobId;

      __appState().jobs[jobId] = {
        status: jobJSON.jobStatus,
        lastChecked: new Date(),
        pollingId: window.setInterval(function () {
          pollJobStatus(def, requestData.token, url, jobId);
        }, 2000)
      };
    })
    .fail(function (err) {
      console.error('Unable to request estimate');
      console.log(err);
    });

  return def;
}