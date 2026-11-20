"""Read-only verification of the paired desktop/plugin release; never runs installers or Rhino."""
import argparse
import hashlib
import json
import struct
import subprocess
import zipfile
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('release')
parser.add_argument('--seven-zip', default='E:/7-Zip/7z.exe')
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
out = Path(args.release).resolve()
version = json.loads((root/'src-tauri/tauri.rhino-beta.conf.json').read_text(encoding='utf-8'))['version']
plugin_version = '0.1.0-' + version.split('-',1)[1]
exe = out/'desktop/inspiration-drawer.exe'
data = exe.read_bytes()
for marker in [b'Current registration is outside the verified managed payload root; cleanup skipped.', b'Old plugin could not be moved:']:
    assert marker in data, ('Missing compiled safe obsolete-payload cleanup', marker)
pe = struct.unpack_from('<I', data, 0x3c)[0]
assert data[:2] == b'MZ' and data[pe:pe+4] == b'PE\0\0' and struct.unpack_from('<H',data,pe+4)[0] == 0x8664
sha = lambda value: hashlib.sha256(value).hexdigest().upper()
checks = {'desktopVersion':version, 'architecture':'x64', 'desktopSha256':sha(data), 'pluginPayloads':[]}
checks['managedPluginCleanup']={'requiresVerifiedCurrentRegistration':True,'movesOnlyToRestoreBackup':True,'preservesLoadedRhinoVersions':True}
for major,framework,folder in [(8,'net7.0','plugin-rhino8'),(9,'net8.0','plugin')]:
    base=out/folder/framework
    payload={p.name:p.read_bytes() for p in base.iterdir() if p.is_file()}
    assert len(payload)==5, payload.keys()
    for name,body in payload.items():
        assert body in data, ('Desktop does not embed paired plugin payload',major,name)
    rhp=payload['InspirationDrawer.Rhino.rhp']
    for asset in ['index.html','panel.js','panel.css','markdown.js','image-preview.js','markdown.css','image-preview.css']:
        assert (root/'integrations/rhino/InspirationDrawer.Rhino/Panel'/asset).read_bytes() in rhp, ('Stale embedded panel asset',major,asset)
    assert framework in payload['InspirationDrawer.Rhino.runtimeconfig.json'].decode()
    archive=out/f'InspirationDrawer-Rhino{major}-Beta-{plugin_version}-win-x64.zip'
    yak_files=list(out.glob(f'*rh{major}_*-win.yak'))
    assert len(yak_files) <= 1, yak_files
    yak=yak_files[0] if yak_files else None
    candidates=[archive] + ([yak] if yak is not None else [])
    for candidate in candidates:
        with zipfile.ZipFile(candidate) as z:
            assert z.testzip() is None
            for name,body in payload.items(): assert z.read(framework+'/'+name)==body, (candidate,name)
    assert b'tool-history' in rhp and b'history.open=active' in rhp, ('Missing collapsed internal Rhino tool history', major)
    checks['pluginPayloads'].append({'rhino':major,'framework':framework,'sha256':sha(rhp),'zip':archive.name,'yak':yak.name if yak else None,'yakVerified':yak is not None,'embeddedInDesktop':True,'embeddedPanelAssetsCurrent':True})
assets=list((root/'dist/assets').glob('index-*.js'))
yellow=[p for p in assets if 'bg-yellow-400 border-yellow-200/90' in p.read_text(encoding='utf-8')]
assert len(yellow)==1
source=yellow[0].read_text(encoding='utf-8')
assert 'foreground:' in source and '?"text-white dark:text-stone-950":"text-white"' in source
assert yellow[0].name.encode() in data, ('Desktop does not embed the latest white-bulb frontend',yellow[0].name)
checks['floatingTrigger']={'background':'yellow','bulb':'white','frontendAsset':yellow[0].name,'assetKeyEmbeddedInDesktop':True}
main_assets=list((root/'dist/assets').glob('main-*.js'))
assert len(main_assets)==1
assert main_assets[0].name.encode() in data,('Desktop frontend is stale',main_assets[0].name)
checks['frontendEntry']={'asset':main_assets[0].name,'assetKeyEmbeddedInDesktop':True}
main_source=main_assets[0].read_text(encoding='utf-8')
for guard in ['The user requested image-prompt text, not image generation.', 'or prompt-writing.', 'Writing, drafting, translating, polishing, explaining']:
    assert guard in main_source, ('Missing compiled Chat prompt-only guard', guard)
checks['chatPromptOnlyProtection']={'compiledToolExposureAndDispatchGuard':True,'compiledModelInstruction':True,'frontendAsset':main_assets[0].name}
installer_register=(root/'src-tauri/src/rhino_installer_register.ps1').read_text(encoding='utf-8')
installer_detect=(root/'src-tauri/src/rhino_installer_detect.ps1').read_text(encoding='utf-8')
assert "$parent.SetValue('Name'," in installer_register
assert r'$plugin = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey("$root\PlugIn")' in installer_register
assert "$plugin.SetValue('FileName',$target" in installer_register
assert r'OpenSubKey("$pluginRoot\PlugIn")' in installer_detect
assert "$installed.GetValue('FileName',$null)" in installer_detect
checks['rhinoInstallerRegistration']={'writesFileNameToRhinoPlugInSubkey':True,'detectsTheSameSubkey':True}
frontend_sources="\n".join(p.read_text(encoding='utf-8') for p in (root/'dist/assets').glob('*.js'))
skill_root=root/'src/features/rhino/skills/rhino-product-modeling'
for relative in ['SKILL.md','references/modeling-methods.md','references/acceptance.md','references/automotive-case.md','references/tutorial-synthesis.md','assets/project-record-template.md','assets/acceptance-report-template.md']:
    markdown=(skill_root/relative).read_text(encoding='utf-8').strip()
    assert markdown and markdown in frontend_sources, ('Missing compiled bundled Rhino modeling Skill resource',relative)
for marker in ['RHINO_MODELING_INTENT_GATE_V4','rhino_read_modeling_skill_resource']:
    assert marker in frontend_sources, ('Missing compiled Rhino modeling integration',marker)
checks['rhinoProductModelingSkill']={'completeSkillBundled':True,'allMarkdownResourcesBundled':True,'fixedAllowlistedReadTool':True}
installers=list(out.glob(f'*{version}*x64-setup.exe'))
assert len(installers)==1, installers
installer=installers[0]
subprocess.run([args.seven_zip,'t',str(installer)],check=True,stdout=subprocess.DEVNULL)
listing=subprocess.check_output([args.seven_zip,'l','-slt',str(installer)]).decode('utf-8',errors='replace')
entries=[line[7:].strip() for line in listing.splitlines() if line.startswith('Path = ') and line.strip().endswith('inspiration-drawer.exe')]
assert len(entries)==1,entries
installed_exe=subprocess.check_output([args.seven_zip,'x','-so',str(installer),entries[0]])
# Tauri/NSIS may leave a mix of NSS (bundled) and UNK (unbundled) marker
# values in the portable executable. Compare all other bytes exactly.
marker_prefix=b'__TAURI_BUNDLE_TYPE_VAR_'
def normalize_bundle_markers(value):
    return value.replace(marker_prefix+b'NSS',marker_prefix+b'XXX').replace(marker_prefix+b'UNK',marker_prefix+b'XXX')
normalized=normalize_bundle_markers(installed_exe)
assert installed_exe==data or normalized==normalize_bundle_markers(data),'Installer and portable differ beyond Tauri bundle markers'
checks['installer']={'file':installer.name,'sha256':sha(installer.read_bytes()),'archiveTestPassed':True,'containedDesktopSha256':sha(installed_exe),'matchesPortableExceptTauriBundleType':True,'onlyDifference':'NSS/UNK marker values' if installed_exe!=data else 'none'}
if (out/'TESTS.json').exists(): checks['automatedTests']=json.loads((out/'TESTS.json').read_text(encoding='utf-8'))
checks['verificationScope']='Build, embedded resources, static color, matching runtime payloads, archive integrity. Not live Rhino/remote-machine functional acceptance.'
(out/'VERIFY.json').write_text(json.dumps(checks,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(checks,ensure_ascii=False,indent=2))
