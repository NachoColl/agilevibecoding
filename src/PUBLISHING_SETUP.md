# Publishing Setup Guide

This package uses automated publishing to **npmjs.org** via GitHub Actions.

## Features

- ✅ **Automated Testing** - Runs CLI tests before publishing
- ✅ **npmjs.org Publishing** - Public registry, no auth needed for installation
- ✅ **OIDC Authentication** - Uses npm Trusted Publisher (no tokens needed)
- ✅ **Version Checks** - Prevents duplicate publishes with auto-bumping
- ✅ **Security** - No secrets exposed in published packages

## Publishing Methods

### Method 1: Automated Publishing via GitHub Actions (Recommended)

This is the **easiest and most secure** method using npm's Trusted Publisher feature with OIDC.

#### Prerequisites

1. **Configure npm Trusted Publisher** (one-time setup):
   - Go to https://www.npmjs.com/settings/YOUR_USERNAME/packages
   - Click on your package (or create it first with `npm publish` locally)
   - Go to **Settings** → **Publishing access**
   - Click **Add Trusted Publisher**
   - Fill in:
     - **Provider**: GitHub Actions
     - **Repository**: `NachoColl/agilevibecoding`
     - **Workflow**: `publish-avc.yml`
     - **Environment**: (leave blank)
   - Save

2. **Ensure package.json has correct name**:
   ```json
   {
     "name": "@agile-vibe-coding/avc-cli"
   }
   ```

#### How to Publish

1. **Update the version** in `src/package.json`:
   ```bash
   cd src
   npm version patch  # for bug fixes (0.1.0 → 0.1.1)
   npm version minor  # for new features (0.1.0 → 0.2.0)
   npm version major  # for breaking changes (0.1.0 → 1.0.0)
   ```

2. **Commit and push**:
   ```bash
   git add src/package.json
   git commit -m "chore: bump version to $(node -p 'require(\"./src/package.json\").version')"
   git push origin master
   ```

3. **GitHub Actions will automatically**:
   - Run CLI tests
   - Check if version already exists on npmjs.org
   - **If version is new**: Publish to npmjs.org (using OIDC, no token needed)
   - **If version exists**: Skip publishing (you must bump version manually)

4. **Monitor the workflow**:
   - Go to: https://github.com/NachoColl/agilevibecoding/actions
   - Watch the "Publish AVC CLI to npm" workflow

**Important**: The workflow will **skip publishing** if the version in `src/package.json` already exists on npmjs.org. To publish a new version:
1. Make your code changes
2. Run `cd src && npm version patch` (or minor/major)
3. Commit and push the updated `package.json`
4. GitHub Actions will then publish the new version

### Method 2: Manual Publishing (Fallback)

Use this method if you need to publish manually or if GitHub Actions is not available.

#### Prerequisites

You need an **NPM_TOKEN** stored in `.env` file in the `src/` directory:

1. **Generate npm token**:
   - Go to: https://www.npmjs.com/settings/YOUR_USERNAME/tokens
   - Click "Generate New Token" → **"Granular Access Token"**
   - Settings:
     - **Expiration**: 90 days (max)
     - **Packages and scopes**: Select "Read and write" for `@agile-vibe-coding`
     - Or select "All packages" if scope doesn't exist yet
   - Copy the token

2. **Create `src/.env` file**:
   ```bash
   NPM_TOKEN=npm_YOUR_TOKEN_HERE
   ```

#### How to Publish Manually

```bash
# Navigate to src directory
cd src

# 1. Update version
npm version patch  # or minor/major

# 2. Run tests
npm test

# 3. Configure authentication
npm config set //registry.npmjs.org/:_authToken="${NPM_TOKEN}"

# 4. Publish to npmjs.org
npm publish --access public
```

Or use the npm login flow:

```bash
cd src
npm login
npm version patch
npm publish --access public
```

## What Gets Published?

Only these files are included in the published package (defined in `package.json` "files" array):

```
cli/           - CLI scripts (index.js, init.js)
README.md      - Documentation
LICENSE        - License file
package.json   - Package metadata
```

**NOT published** (protected by `.gitignore` and `.npmignore`):
- `.env` - Environment variables and tokens
- `test/` - Test files
- `examples/` - Example files
- Development config files

## Security Checks

Before every publish (automated or manual), the following checks run:

1. ✅ CLI help command works
2. ✅ CLI init and status commands work in test directory
3. ✅ `npm pack --dry-run` verifies no secrets in package
4. ✅ Tests pass

## Installation After Publishing

Once published, users can install via:

### Global Installation (recommended for CLI tools):
```bash
npm install -g @agile-vibe-coding/avc-cli
```

Then use anywhere:
```bash
avc init
avc status
avc help
```

### Local Installation:
```bash
npm install @agile-vibe-coding/avc-cli
npx avc init
```

## Troubleshooting

### "Version already exists" - workflow skips publishing
- The workflow will skip publishing if the version already exists on npmjs.org
- To publish: run `cd src && npm version patch` (or minor/major), then commit and push

### "Authentication failed" on npm
- For automated publishing: Check npm Trusted Publisher configuration
- For manual publishing: Your NPM_TOKEN expired or is invalid
- Solution: Generate a new token at https://www.npmjs.com/settings/YOUR_USERNAME/tokens

### Tests fail before publishing
- The automated workflow stops before publishing if tests fail
- Solution: Fix the failing tests locally and push again

### OIDC/Trusted Publisher not working
- Make sure you configured it correctly on npmjs.com
- Check that the repository name matches: `NachoColl/agilevibecoding`
- Check that the workflow name matches: `publish-avc.yml`
- Verify your GitHub Actions workflow has `id-token: write` permission

### Package not found after publishing
- Wait a few minutes for npm registry to update
- Clear npm cache: `npm cache clean --force`
- Try installing with explicit version: `npm install -g @agile-vibe-coding/avc-cli@0.1.0`

### "402 Payment Required" error
- npm requires payment for private scoped packages
- Our package is **public** (`publishConfig: { "access": "public" }`)
- Make sure you're using `npm publish --access public` if publishing manually

## Version Strategy

We use [Semantic Versioning](https://semver.org/):

- **PATCH** (0.1.0 → 0.1.1): Bug fixes, minor improvements
- **MINOR** (0.1.0 → 0.2.0): New features, backward compatible
- **MAJOR** (0.1.0 → 1.0.0): Breaking changes

Before 1.0.0 release:
- Use 0.x.y versions for development
- Breaking changes can happen in minor versions
- Communicate clearly with users

## Package Information

- **Package page**: https://www.npmjs.com/package/@agile-vibe-coding/avc-cli
- **Download stats**: https://npm-stat.com/charts.html?package=@agile-vibe-coding/avc-cli
- **Documentation**: https://agilevibecoding.org

## References

- [npm Trusted Publishers](https://docs.npmjs.com/generating-provenance-statements)
- [Publishing scoped packages](https://docs.npmjs.com/creating-and-publishing-scoped-public-packages)
- [GitHub Actions OIDC](https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/about-security-hardening-with-openid-connect)
- [Semantic Versioning](https://semver.org/)
