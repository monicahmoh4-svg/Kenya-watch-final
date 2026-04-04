'use strict';

// ── Contract validation ───────────────────────────────────────────────────────
const validateContract = (body) => {
  const errors = [];
  const { contract_id, supplier, value, description, county } = body;

  if (!contract_id || typeof contract_id !== 'string' || contract_id.trim().length < 3) {
    errors.push('contract_id is required and must be at least 3 characters');
  } else if (!/^[A-Z0-9\-_]+$/i.test(contract_id.trim())) {
    errors.push('contract_id may only contain letters, numbers, hyphens, and underscores');
  }

  if (!supplier || typeof supplier !== 'string' || supplier.trim().length < 2) {
    errors.push('supplier name is required and must be at least 2 characters');
  }

  if (value === undefined || value === null || value === '') {
    errors.push('value (contract amount in KES) is required');
  } else if (isNaN(parseInt(value)) || parseInt(value) < 0) {
    errors.push('value must be a non-negative number');
  } else if (parseInt(value) > 100_000_000_000) {
    errors.push('value exceeds maximum allowed (100 billion KES)');
  }

  if (description && description.length > 1000) {
    errors.push('description must be under 1000 characters');
  }

  const validCounties = [
    'Nairobi', 'Mombasa', 'Kisumu', 'Nakuru', 'Kiambu', 'Kisii',
    'Kakamega', 'Turkana', 'Nyeri', 'Machakos', 'Meru', 'Kilifi',
    'Uasin Gishu', 'Murang\'a', 'Bungoma', 'Siaya', 'Homa Bay',
    'Trans Nzoia', 'Nandi', 'Bomet', 'Kericho', 'Laikipia',
    'Samburu', 'Isiolo', 'Marsabit', 'Mandera', 'Wajir', 'Garissa',
    'Tana River', 'Lamu', 'Taita Taveta', 'Kwale', 'Kajiado',
    'Makueni', 'Kitui', 'Embu', 'Tharaka Nithi', 'Kirinyaga',
    'Nyandarua', 'Nyamira', 'Migori', 'Kisii', 'Vihiga',
    'Busia', 'Elgeyo Marakwet', 'West Pokot', 'Baringo', 'Narok',
    'Other'
  ];

  if (county && !validCounties.includes(county)) {
    errors.push(`county must be a valid Kenya county`);
  }

  return { valid: errors.length === 0, errors };
};

// ── Report validation ─────────────────────────────────────────────────────────
const validateReport = (body) => {
  const errors = [];
  const { type, description, county, sector, amount } = body;

  const validTypes = [
    'Bribery / Kickbacks',
    'Ghost project / Fake delivery',
    'Procurement fraud',
    'Embezzlement of public funds',
    'Nepotism / Political appointments',
    'Police extortion',
    'Land grabbing',
    'Other'
  ];

  if (!type || !validTypes.includes(type)) {
    errors.push(`type is required and must be one of: ${validTypes.join(', ')}`);
  }

  if (!description || typeof description !== 'string' || description.trim().length < 20) {
    errors.push('description is required and must be at least 20 characters');
  } else if (description.length > 5000) {
    errors.push('description must be under 5000 characters');
  }

  if (amount !== undefined && amount !== null && amount !== '') {
    if (isNaN(parseInt(amount)) || parseInt(amount) < 0) {
      errors.push('amount must be a non-negative number if provided');
    }
  }

  const validSectors = [
    'Health', 'Education', 'Roads & Infrastructure', 'Water & Sanitation',
    'Police & Security', 'Lands', 'Agriculture', 'ICT', 'Energy', 'Other'
  ];

  if (sector && !validSectors.includes(sector)) {
    errors.push(`sector must be one of: ${validSectors.join(', ')}`);
  }

  return { valid: errors.length === 0, errors };
};

// ── Ghost project validation ──────────────────────────────────────────────────
const validateGhostProject = (body) => {
  const errors = [];
  const { project_name, county, amount_at_risk, detection_status } = body;

  if (!project_name || typeof project_name !== 'string' || project_name.trim().length < 3) {
    errors.push('project_name is required and must be at least 3 characters');
  } else if (project_name.length > 300) {
    errors.push('project_name must be under 300 characters');
  }

  if (amount_at_risk !== undefined && amount_at_risk !== null && amount_at_risk !== '') {
    if (isNaN(parseInt(amount_at_risk)) || parseInt(amount_at_risk) < 0) {
      errors.push('amount_at_risk must be a non-negative number');
    }
  }

  const validStatuses = ['ghost', 'partial', 'verified', 'flagged', 'investigating'];
  if (detection_status && !validStatuses.includes(detection_status)) {
    errors.push(`detection_status must be one of: ${validStatuses.join(', ')}`);
  }

  return { valid: errors.length === 0, errors };
};

// ── Chat message validation ───────────────────────────────────────────────────
const validateChatMessage = (body) => {
  const errors = [];
  const { message } = body;

  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    errors.push('message is required');
  } else if (message.trim().length < 2) {
    errors.push('message must be at least 2 characters');
  } else if (message.length > 2000) {
    errors.push('message must be under 2000 characters');
  }

  return { valid: errors.length === 0, errors };
};

// ── Status update validation ──────────────────────────────────────────────────
const validateStatusUpdate = (status, allowed) => {
  if (!status) return { valid: false, errors: ['status is required'] };
  if (!allowed.includes(status)) {
    return { valid: false, errors: [`status must be one of: ${allowed.join(', ')}`] };
  }
  return { valid: true, errors: [] };
};

module.exports = {
  validateContract,
  validateReport,
  validateGhostProject,
  validateChatMessage,
  validateStatusUpdate
};
