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
