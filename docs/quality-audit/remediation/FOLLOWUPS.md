# Follow-ups discovered during remediation

## RT-08
- `package-lock.json` (root and `functions/`) was generated with npm 11. `npm ci` under Node 22's bundled npm 10.9.4 fails with EUSAGE ("Missing: @emnapi/runtime@1.11.3, @emnapi/core@1.11.3 from lock file"). CI works around this with `npm install -g npm@11`; a proper fix is to regenerate the lockfile so npm 10 and 11 both accept it (a dependency/lockfile change, out of scope for RT-08), or pin `packageManager`/`engines.npm`.
- `.nvmrc` pinning Node 22 and Java/emulator prerequisites in README (L-013) are not added by RT-08.
- `.github/dependabot.yml` (suggested by L-001) is not added.
