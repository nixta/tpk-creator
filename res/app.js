$(document).ready(function () {
  $.cookie.json = true;

  $('body').data('esri-tpk-generator', {
    clientId: 'ycUvqwhnMGffespX',
    jobs: {}
  });

  initAuthenticationState();
  initializeUI();
  initializeMap();
});

function __appState() {
  return $('body').data('esri-tpk-generator');
}
