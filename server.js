const express = require('express');
const { Pool } = require('pg');

const app = express();
const port = process.env.PORT || 80;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

app.get('/api/products-forecast', async (req, res) => {
  const query = `
    SELECT 
      p.id, p.sku, p.name, p.category, p.current_stock, p.unit_weight_lb,
      f.predicted_demand_qty, f.purchase_probability, f.model_version, f.created_at AS forecast_date
    FROM products p
    LEFT JOIN LATERAL (
      SELECT predicted_demand_qty, purchase_probability, model_version, created_at
      FROM ai_demand_forecast
      WHERE product_id = p.id
      ORDER BY created_at DESC
      LIMIT 1
    ) f ON true
    ORDER BY p.sku ASC;
  `;
  try {
    const { rows } = await pool.query(query);
    res.json({ status: 'ok', count: rows.length, data: rows });
  } catch (err) {
    res.status(500).json({ status: 'error', message: err.message });
  }
});

app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Tradepak · Inteligencia de Producción</title>
      <style>
        body { font-family: 'Segoe UI', Arial, sans-serif; background: #121212; color: #f0f0f0; margin: 0; padding: 2rem; }
        .header { display: flex; justify-content: space-between; align-items: center; gap: 1rem; flex-wrap: wrap; border-bottom: 2px solid #6A0DAD; padding-bottom: 1rem; margin-bottom: 1.5rem; }
        h1 { color: #6A0DAD; margin: 0; font-size: 1.5rem; }
        button { background: #6A0DAD; color: #fff; border: none; padding: 10px 18px; border-radius: 6px; cursor: pointer; font-weight: bold; }
        button:hover { background: #7b19c0; }
        .table-wrap { overflow-x: auto; }
        table { width: 100%; border-collapse: collapse; background: #1e1e1e; border-radius: 8px; overflow: hidden; }
        th, td { padding: 12px 16px; text-align: left; border-bottom: 1px solid #2a2a2a; white-space: nowrap; }
        th { background: #252525; color: #a8a8a8; font-size: 0.85rem; text-transform: uppercase; }
        .badge { padding: 4px 8px; border-radius: 12px; font-size: 0.8rem; font-weight: bold; display: inline-block; }
        .badge-high { background: #1b4d3e; color: #6ee7b7; }
        .badge-low { background: #4c1d1d; color: #fca5a5; }
        .muted { color: #9ca3af; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>Tradepak · Inventario y Pronóstico AI</h1>
        <button onclick="loadTable()">Actualizar Datos</button>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>SKU</th>
              <th>Producto</th>
              <th>Stock Actual</th>
              <th>Demanda Predicha (AI)</th>
              <th>Prob. Compra</th>
              <th>Versión Modelo</th>
            </tr>
          </thead>
          <tbody id="table-body">
            <tr><td colspan="6">Cargando información...</td></tr>
          </tbody>
        </table>
      </div>
      <script>
        function formatNumber(value, suffix = '') {
          const n = Number(value);
          return Number.isFinite(n) ? n.toLocaleString() + suffix : '--';
        }

        function escapeHtml(value) {
          return String(value).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
          });
        }

        async function loadTable() {
          const tbody = document.getElementById('table-body');
          tbody.innerHTML = '<tr><td colspan="6">Cargando información...</td></tr>';
          try {
            const res = await fetch('/api/products-forecast');
            const payload = await res.json();
            const data = Array.isArray(payload.data) ? payload.data : [];

            if (!data.length) {
              tbody.innerHTML = '<tr><td colspan="6" class="muted">No hay datos disponibles.</td></tr>';
              return;
            }

            tbody.innerHTML = data.map(row => {
              const prob = row.purchase_probability !== null && row.purchase_probability !== undefined
                ? parseFloat(row.purchase_probability)
                : null;
              const badgeClass = prob !== null && prob >= 0.75 ? 'badge-high' : 'badge-low';
              const probabilityCell = prob !== null
                ? '<span class="badge ' + badgeClass + '">' + (prob * 100).toFixed(1) + '%</span>'
                : '<span class="muted">N/A</span>';
              const demandCell = (row.predicted_demand_qty !== null && row.predicted_demand_qty !== undefined)
                ? formatNumber(row.predicted_demand_qty, ' lb')
                : 'Sin pronóstico';

              return '<tr>' +
                '<td><strong>' + escapeHtml(row.sku || '--') + '</strong></td>' +
                '<td>' + escapeHtml(row.name || '--') + '</td>' +
                '<td>' + formatNumber(row.current_stock, ' lb') + '</td>' +
                '<td>' + demandCell + '</td>' +
                '<td>' + probabilityCell + '</td>' +
                '<td>' + escapeHtml(row.model_version || '--') + '</td>' +
                '</tr>';
            }).join('');
          } catch (err) {
            tbody.innerHTML = '<tr><td colspan="6">Error al cargar datos.</td></tr>';
          }
        }
        loadTable();
      </script>
    </body>
    </html>
  `);
});

app.listen(port, () => console.log(`App running on port ${port}`));
