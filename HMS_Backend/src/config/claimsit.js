// Legacy stub for claimsIT configuration.  The actual service logic has
// been migrated to ../services/claimsITService.js, which generates JSON
// exports for offline NHIA claims import.  This module simply proxies to
// the new service to avoid breaking any existing requires.

module.exports = require('../services/claimsITService');
