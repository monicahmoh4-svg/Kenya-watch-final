const express = require('express');
const pool = require('../db/index');
const router = express.Router();

router.get('/supplier-network', async (req, res) => {
  try {
    // Finds suppliers that appear multiple times or share similar names/addresses
    const result = await pool.query(`
      SELECT supplier_name, county, contract_value, award_date,
             COUNT(*) OVER (PARTITION BY supplier_name) as contract_count
      FROM contracts
      ORDER BY contract_count DESC, award_date DESC
      LIMIT 100
    `);
    
    // Transform for frontend graph library (e.g., Vis.js or D3)
    const nodes = [];
    const edges = [];
    const supplierMap = new Map();

    result.rows.forEach((row, index) => {
      if (!supplierMap.has(row.supplier_name)) {
        supplierMap.set(row.supplier_name, { id: `s-${index}`, label: row.supplier_name, group: 'supplier', size: row.contract_count * 5 });
        nodes.push(supplierMap.get(row.supplier_name));
      }
      nodes.push({ id: `c-${index}`, label: row.county, group: 'county' });
      edges.push({ from: `s-${index}`, to: `c-${index}`, value: row.contract_value });
    });

    res.json({ nodes, edges });
  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500).json({ error: 'Failed to fetch network data' });
  }
});

module.exports = router;
