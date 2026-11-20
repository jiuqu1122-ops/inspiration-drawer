"""Guard the Rhino 8 WebView host against fixed-size resize regressions."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
plugin = (ROOT / "integrations/rhino/InspirationDrawer.Rhino/Plugin.cs").read_text(encoding="utf-8")
layout = (ROOT / "integrations/rhino/InspirationDrawer.Rhino/DrawerPanelLayout.cs").read_text(encoding="utf-8")
css = (ROOT / "integrations/rhino/InspirationDrawer.Rhino/Panel/panel.css").read_text(encoding="utf-8")

rhino8 = plugin.split("#if RHINO8", 1)[1].split("#else", 1)[0]
rhino9 = plugin.split("#else", 1)[1].split("#endif", 1)[0]
assert "new DynamicLayout()" in rhino8
assert "layout.BeginVertical(Eto.Drawing.Padding.Empty, Eto.Drawing.Size.Empty, true, true)" in rhino8
assert "layout.Add(view, true, true)" in rhino8
assert "view.Size =" not in rhino8 and "view.Bounds =" not in rhino8, "Do not pin the WebView to stale pixels; let the expanding host resize it."
assert "Content = view;" in rhino9, "Keep the working Rhino 9 WebView host path unchanged."
assert "MinimumWidth = 340" in layout and "MinimumHeight = 420" in layout
assert "@media (max-width: 340px)" in css
assert ".image-settings-primary { display:grid;" in css
assert ".rhino-composer { display:flex;" in css
assert ".panel-picker-menu { position:fixed;" in css
assert ".tool-history {" in css and ".tool-history__summary" in css
panel_js = (ROOT / "integrations/rhino/InspirationDrawer.Rhino/Panel/panel.js").read_text(encoding="utf-8")
assert "history.open=active" in panel_js and "tool-history__items" in panel_js
assert "['pending','running','awaiting-approval']" in panel_js
assert "${tools.length}" in panel_js and "failures" in panel_js
html = (ROOT / "integrations/rhino/InspirationDrawer.Rhino/Panel/index.html").read_text(encoding="utf-8")
composer = html[html.index('<form id="composer"'):html.index("</form>")]
for control in ["model", "image-model", "image-resolution", "image-aspect-ratio", "viewport", "canvas", "mask", "attach-local-image"]:
    assert f'id="{control}"' in composer, control
print("PASS Rhino 8 WebView is dynamically expanding with no fixed child bounds")
print("PASS Rhino 9 direct WebView host path remains unchanged")
print("PASS compact panel minimum and narrow-screen settings layout are present")
