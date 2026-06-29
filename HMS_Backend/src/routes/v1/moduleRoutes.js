'use strict';

const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../../middleware/auth');
const adminController = require('../../controllers/adminController');

// Any authenticated user can query module status for their facility
router.use(authenticateToken);

router.get('/status', adminController.getModuleStatus);

module.exports = router;
