(() => {
  var user = null;
  try {
    user = localStorage.getItem("logbook_signed_in_user");
  } catch {}
  location.replace(user ? `/${encodeURIComponent(user)}/log` : "/-/login/");
})();
