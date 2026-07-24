const express = require('express');
const { z } = require('zod');
const pool = require('../db/index');
const router = express.Router();

const reportSchema = z.object({
  county: z.string().min(2, "County is required"),
  project_name: z.string().min(5, "Project name is too short"),
  description: z.string().min(10, "Please provide more details"),
  reporter_name: z.string().optional(),
  contact: z.string().optional()
});

router.post('/', async (req, res) => {
  try {
    const validatedData = reportSchema.parse(req.body);
    const { county, project_name, description, reporter_name, contact } = validatedData;
    
    const result = await pool.query(
      `INSERT INTO reports (county, project_name, description, reporter_name, contact, status) 
       VALUES ($1, $2, $3, $4, $5, 'pending') RETURNING id`,
      [county, project_name, description, reporter_name || 'Anonymous', contact || 'N/A']
    );
    
    res.status(201).json({ message: 'Report submitted successfully', id: result.rows[0].id });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    console.error('Report submission error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
