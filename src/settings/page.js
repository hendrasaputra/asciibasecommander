(() => {
const box = document.getElementById("crt"), status = document.getElementById("status");
const s = applyArcadeSettings({});   // also installs the TV filter CSS the games use, so the preview matches them
box.checked = !!s.crt;
box.addEventListener("change", () => {
  s.crt = box.checked; document.body.classList.toggle("crt", s.crt);
  status.textContent = saveArcadeSettings(s) ? "Saved" : "Could not save: this browser is blocking storage.";
});
})();
