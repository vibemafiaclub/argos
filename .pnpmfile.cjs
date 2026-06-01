module.exports = {
  hooks: {
    readPackage(pkg) {
      if (pkg.name === 'next' && pkg.version === '15.5.18') {
        pkg.dependencies = pkg.dependencies || {}
        pkg.dependencies.postcss = '8.5.15'
      }
      return pkg
    },
  },
}
