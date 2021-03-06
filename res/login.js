var signInStatus = '#signInStatus',
    signInButton = '#esriSignIn',
    // signOutButton = '#esriSignOut',
    signOutLabel = '#esriUsername',
    tpkPanel = '#tpkPanel';

function setUILoggedIn() {
  require(['esri/arcgis/Portal'], function (arcgisPortal) {
    new arcgisPortal.Portal(__appState().oauthInfo.portalUrl).signIn()
      .then(function (portalUser) {
        __appState().portalUser = portalUser;
        $(signOutLabel).text(portalUser.username);
        $(signInButton).fadeOut('fast', function () {
          $(tpkPanel).fadeIn('slow');
          // $(signOutButton).fadeIn('slow');
        });
        setTpkButtonsEnabled();
      }
    ).otherwise(
      function(error) {
        console.log("Error occurred while signing in: ", error);
        setUILoggedOut();
      }
    );
  });
}

function setUILoggedOut() {
  $(tpkPanel).fadeOut('fast', function() {
    $(signInButton).fadeIn('slow');
  });
  setTpkButtonsEnabled();
}
