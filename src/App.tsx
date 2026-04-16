import React from 'react';

// Soil sample input form
function SoilSampleForm({ onSubmit, loading }: { onSubmit: (data: any) => void, loading: boolean }) {
  const [form, setForm] = React.useState({
    soil_ph: '',
    nitrogen: '',
    organic_carbon_density: '',
    sand: '',
    soil_clay: '',
    rainfall_mean: '',
    rainfall_std: '',
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Convert all values to numbers
    const data = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v === '' ? null : Number(v)]));
    onSubmit(data);
  };

  return (
    <form onSubmit={handleSubmit} style={{ margin: '16px 0', padding: 16, background: '#fff', borderRadius: 8 }}>
      <h3>Manual Soil Sample Entry</h3>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
        <input name="soil_ph" type="number" step="0.01" placeholder="Soil pH" value={form.soil_ph} onChange={handleChange} required />
        <input name="nitrogen" type="number" step="0.01" placeholder="Nitrogen (mg/kg)" value={form.nitrogen} onChange={handleChange} required />
        <input name="organic_carbon_density" type="number" step="0.01" placeholder="Organic Carbon Density" value={form.organic_carbon_density} onChange={handleChange} required />
        <input name="sand" type="number" step="0.01" placeholder="Sand (%)" value={form.sand} onChange={handleChange} required />
        <input name="soil_clay" type="number" step="0.01" placeholder="Clay (%)" value={form.soil_clay} onChange={handleChange} required />
        <input name="rainfall_mean" type="number" step="0.01" placeholder="Rainfall Mean (mm)" value={form.rainfall_mean} onChange={handleChange} required />
        <input name="rainfall_std" type="number" step="0.01" placeholder="Rainfall Std (mm)" value={form.rainfall_std} onChange={handleChange} required />
      </div>
      <button type="submit" disabled={loading} style={{ marginTop: 16 }}>Analyze Sample</button>
    </form>
  );
}
import { useState, useEffect } from 'react'
import MapPicker from './MapPicker'

const rawApiBase = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')
const API = rawApiBase
  ? (rawApiBase.endsWith('/api') ? rawApiBase : `${rawApiBase}/api`)
  : '/api'

type Stats = {
  total_locations: number
  suitable_sites: number
  suitable_pct: number
  avg_rainfall: number
  avg_ph: number
}

type Analysis = {
  lat: number
  lon: number
  suitability_pct: number
  zone: string
  rainfall_mm: number
  soil_ph: number
  suggested_crops: string[]
  recommendations: string[]
  categories: Record<string, string[]>
  model?: string
}

const QUICK_PLACES = [
  'Gweru', 'Mutare', 'Chinhoyi', 'Bulawayo',
  'Chiredzi', 'Nyanga', 'Masvingo', 'Kariba',
]

const ALL_PLACES = [
  'Harare', 'Bulawayo', 'Mutare', 'Gweru', 'Chitungwiza', 'Kwekwe',
  'Kadoma', 'Masvingo', 'Chinhoyi', 'Marondera', 'Nyanga', 'Chiredzi',
  'Zvishavane', 'Bindura', 'Beitbridge', 'Kariba', 'Victoria Falls', 'Hwange',
  'Epworth', 'Gwanda', 'Lupane', 'Chipinge', 'Rusape', 'Chegutu', 'Norton',
  'Gokwe', 'Redcliff', 'Shurugwi', 'Guruve', 'Glendale', 'Binga',
]

const NAV_ITEMS = [
  { icon: '◈', label: 'Overview', key: 'overview' },
  { icon: '⬡', label: 'Soil data', key: 'soil' },
  { icon: '◎', label: 'Rainfall', key: 'rainfall' },
  { icon: '⊞', label: 'Map picker', key: 'map' },
  { icon: '📝', label: 'Manual Entry', key: 'manual' },
]

const REGIONS = [
  'Natural Region I',
  'Natural Region II',
  'Natural Region III',
  'Lowveld / IV–V',
]

// Representative towns to visualize each Natural Region quickly.
// Clicking a region button triggers analysis for that example location.
const REGION_REPRESENTATIVES: Record<string, string> = {
  'Natural Region I': 'Nyanga',
  'Natural Region II': 'Harare',
  'Natural Region III': 'Gweru',
  'Lowveld / IV–V': 'Chiredzi',
}

function getFitLabel(crop: string): { label: string; cls: string } {
  const high = ['maize', 'tobacco', 'wheat', 'coffee', 'tea', 'macadamia']
  const low = ['sorghum', 'millet', 'cotton']
  const cl = crop.toLowerCase()
  if (high.some(h => cl.includes(h))) return { label: 'High fit', cls: 'fit-high' }
  if (low.some(l => cl.includes(l))) return { label: 'Monitor', cls: 'fit-low' }
  return { label: 'Moderate', cls: 'fit-med' }
}

function getSuitVerdict(pct: number) {
  if (pct > 60) return { label: 'Highly suitable', cls: 'verdict-high' }
  if (pct > 40) return { label: 'Marginal', cls: 'verdict-med' }
  return { label: 'Low suitability', cls: 'verdict-low' }
}

// Rough monthly rainfall weights by zone (illustrative)
const MONTHLY_WEIGHTS = [0.18, 0.16, 0.14, 0.04, 0.01, 0.01, 0.01, 0.02, 0.05, 0.12, 0.13, 0.13]
const MONTH_LABELS = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D']

export default function App() {
  const [place, setPlace] = useState('')
  const [mapLat, setMapLat] = useState(-17.828)
  const [mapLon, setMapLon] = useState(31.053)
  const [activeNav, setActiveNav] = useState('overview')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [stats, setStats] = useState<Stats | null>(null)
  const [analysis, setAnalysis] = useState<Analysis | null>(null)

  useEffect(() => {
    fetch(`${API}/stats`)
      .then(r => r.json())
      .then(setStats)
      .catch(() => setStats(null))
  }, [])

  const searchByPlace = (override?: string) => {
    const q = String(override ?? place ?? '').trim()
    if (!q) return
    setLoading(true)
    setError('')
    setAnalysis(null)
    fetch(`${API}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ place: q }),
    })
      .then(r => {
        if (!r.ok) return r.json().then((e: { detail?: string }) => { throw new Error(e.detail || 'Failed') })
        return r.json()
      })
      .then((data: Analysis) => {
        setAnalysis(data)
        setMapLat(data.lat)
        setMapLon(data.lon)
      })
      .catch(e => setError(e.message || 'Search failed'))
      .finally(() => setLoading(false))
  }

  const searchByCoords = () => {
    setLoading(true)
    setError('')
    setAnalysis(null)
    fetch(`${API}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat: mapLat, lon: mapLon }),
    })
      .then(r => {
        if (!r.ok) return r.json().then((e: { detail?: string }) => { throw new Error(e.detail || 'Failed') })
        return r.json()
      })
      .then((data: Analysis) => setAnalysis(data))
      .catch(e => setError(e.message || 'Failed'))
      .finally(() => setLoading(false))
  }


  // Handler for manual soil sample submission
  const handleSoilSample = (sample: any) => {
    setLoading(true);
    setError('');
    setAnalysis(null);
    fetch(`${API}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sample),
    })
      .then(r => {
        if (!r.ok) return r.json().then((e: { detail?: string }) => { throw new Error(e.detail || 'Failed') })
        return r.json()
      })
      .then((data: Analysis) => setAnalysis(data))
      .catch(e => setError(e.message || 'Failed'))
      .finally(() => setLoading(false));
  };

  const verdict = analysis ? getSuitVerdict(analysis.suitability_pct) : null

  const view = activeNav === 'soil' ? 'soil' : activeNav === 'rainfall' ? 'rainfall' : activeNav === 'manual' ? 'manual' : 'overview'
  const filteredRecommendations =
    analysis?.recommendations?.filter((rec) => {
      if (view === 'soil') return /(lime|liming|p\.?h|ph|acid|alkaline|fertil|nitrogen)/i.test(rec)
      if (view === 'rainfall') return /(rain|drought|irrig|natural region)/i.test(rec)
      return true
    }) ?? []

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display&family=DM+Sans:opsz,wght@9..40,400;9..40,500&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        .fa-root {
          font-family: 'DM Sans', system-ui, sans-serif;
          font-size: 14px;
          line-height: 1.6;
          background: #f5f4f0;
          min-height: 100vh;
          display: flex;
          flex-direction: column;
        }

        /* ── Top bar ── */
        .fa-topbar {
          background: #173404;
          padding: 0 24px;
          height: 54px;
          display: flex;
          align-items: center;
          gap: 14px;
          flex-shrink: 0;
        }
        .fa-logo {
          width: 32px; height: 32px;
          border-radius: 8px;
          background: #639922;
          display: flex; align-items: center; justify-content: center;
          font-family: 'DM Serif Display', serif;
          font-size: 17px;
          color: #EAF3DE;
          flex-shrink: 0;
        }
        .fa-topbar-title {
          font-family: 'DM Serif Display', serif;
          font-size: 17px;
          color: #fff;
          letter-spacing: -0.2px;
        }
        .fa-topbar-sub {
          font-size: 11px;
          color: rgba(255,255,255,0.45);
          margin-top: 1px;
        }
        .fa-topbar-right {
          margin-left: auto;
          display: flex; align-items: center; gap: 8px;
        }
        .fa-badge {
          font-size: 11px;
          padding: 3px 10px;
          border-radius: 20px;
        }
        .fa-badge-model {
          background: rgba(255,255,255,0.1);
          color: rgba(255,255,255,0.6);
        }
        .fa-badge-live {
          background: #639922;
          color: #173404;
          font-weight: 500;
          display: flex; align-items: center; gap: 5px;
        }
        .fa-live-dot {
          width: 6px; height: 6px; border-radius: 50%;
          background: #173404;
          animation: fa-pulse 1.8s ease-in-out infinite;
        }
        @keyframes fa-pulse { 0%,100%{opacity:1} 50%{opacity:0.35} }

        /* ── Body layout ── */
        .fa-body {
          display: flex;
          flex: 1;
          overflow: hidden;
        }

        /* ── Sidebar ── */
        .fa-sidebar {
          width: 210px;
          flex-shrink: 0;
          background: #fff;
          border-right: 1px solid #e8e6df;
          display: flex;
          flex-direction: column;
          padding: 16px 10px;
          gap: 2px;
          overflow-y: auto;
        }
        .fa-nav-section {
          font-size: 9.5px;
          font-weight: 500;
          letter-spacing: 0.09em;
          text-transform: uppercase;
          color: #9a9890;
          padding: 12px 10px 5px;
        }
        .fa-nav-item {
          display: flex; align-items: center; gap: 9px;
          padding: 8px 10px;
          border-radius: 7px;
          font-size: 13px;
          color: #5a5955;
          cursor: pointer;
          background: none;
          border: none;
          width: 100%;
          text-align: left;
          transition: background 0.12s, color 0.12s;
          font-family: inherit;
        }
        .fa-nav-item:hover { background: #f1f0ea; color: #2a2a28; }
        .fa-nav-item.active { background: #EAF3DE; color: #27500A; font-weight: 500; }
        .fa-nav-icon {
          width: 22px; height: 22px; border-radius: 5px;
          display: flex; align-items: center; justify-content: center;
          font-size: 12px;
          background: #f5f4f0;
          flex-shrink: 0;
        }
        .fa-nav-item.active .fa-nav-icon { background: #C0DD97; }
        .fa-sidebar-divider {
          height: 1px; background: #eceae3; margin: 8px 0;
        }
        .fa-data-pill {
          display: flex; align-items: center; gap: 8px;
          padding: 6px 10px;
          font-size: 12px; color: #6b6a66;
        }
        .fa-dot {
          width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
        }
        .fa-sidebar-footer {
          margin-top: auto;
          padding: 12px 10px 4px;
        }
        .fa-sidebar-footer p {
          font-size: 10px; color: #aaa9a4; line-height: 1.5;
        }

        /* ── Main ── */
        .fa-main {
          flex: 1;
          overflow-y: auto;
          padding: 24px;
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        /* ── Search ── */
        .fa-search-row {
          display: flex; gap: 8px; align-items: center;
        }
        .fa-search-wrap {
          flex: 1;
          display: flex; align-items: center; gap: 10px;
          background: #fff;
          border: 1px solid #dddbd3;
          border-radius: 9px;
          padding: 0 14px;
          transition: border-color 0.15s;
        }
        .fa-search-wrap:focus-within { border-color: #639922; }
        .fa-search-icon { font-size: 15px; color: #b0aea6; }
        .fa-search-input {
          flex: 1; border: none; background: none; outline: none;
          font-family: inherit; font-size: 13.5px;
          color: #2a2a28;
          padding: 11px 0;
        }
        .fa-search-input::placeholder { color: #b0aea6; }
        .fa-btn {
          border-radius: 9px;
          padding: 10px 18px;
          font-size: 13px;
          font-weight: 500;
          font-family: inherit;
          cursor: pointer;
          border: none;
          white-space: nowrap;
          transition: opacity 0.15s;
        }
        .fa-btn:disabled { opacity: 0.55; cursor: not-allowed; }
        .fa-btn-primary { background: #27500A; color: #EAF3DE; }
        .fa-btn-primary:hover:not(:disabled) { background: #173404; }
        .fa-btn-secondary {
          background: #fff;
          color: #5a5955;
          border: 1px solid #dddbd3;
        }
        .fa-btn-secondary:hover:not(:disabled) { background: #f5f4f0; }

        .fa-chips {
          display: flex; flex-wrap: wrap; gap: 6px; align-items: center;
        }
        .fa-chips-label { font-size: 11px; color: #aaa9a4; }
        .fa-chip {
          font-size: 11px; padding: 3px 10px;
          border-radius: 20px;
          background: #EAF3DE; color: #27500A;
          border: 1px solid #C0DD97;
          cursor: pointer; font-family: inherit;
          transition: background 0.12s;
        }
        .fa-chip:hover { background: #C0DD97; }

        /* ── Metric cards ── */
        .fa-metrics {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 12px;
        }
        .fa-metric {
          background: #fff;
          border-radius: 10px;
          border: 1px solid #eceae3;
          padding: 14px 16px;
          display: flex; flex-direction: column; gap: 3px;
        }
        .fa-metric.accent { background: #EAF3DE; border-color: #C0DD97; }
        .fa-metric-label {
          font-size: 10px; font-weight: 500;
          text-transform: uppercase; letter-spacing: 0.08em;
          color: #9a9890;
        }
        .fa-metric.accent .fa-metric-label { color: #3B6D11; }
        .fa-metric-value {
          font-family: 'DM Serif Display', serif;
          font-size: 28px; line-height: 1.1;
          color: #1a1a18;
        }
        .fa-metric.accent .fa-metric-value { color: #27500A; }
        .fa-metric-sub { font-size: 11px; color: #9a9890; }

        /* ── Results grid ── */
        .fa-results-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
        }

        .fa-card {
          background: #fff;
          border-radius: 12px;
          border: 1px solid #eceae3;
          padding: 20px;
        }
        .fa-card-label {
          font-size: 10px; font-weight: 500;
          text-transform: uppercase; letter-spacing: 0.08em;
          color: #9a9890; margin-bottom: 14px;
        }

        /* Suitability card */
        .fa-suit-score {
          display: flex; align-items: flex-end; gap: 14px;
          margin-bottom: 12px;
        }
        .fa-suit-number {
          font-family: 'DM Serif Display', serif;
          font-size: 56px; line-height: 1;
          color: #27500A;
        }
        .fa-suit-pct { font-size: 22px; color: #639922; }
        .fa-suit-verdict {
          font-size: 11.5px;
          padding: 3px 10px; border-radius: 20px;
          margin-bottom: 4px;
          display: inline-block;
        }
        .verdict-high { background: #EAF3DE; color: #27500A; }
        .verdict-med  { background: #FAEEDA; color: #633806; }
        .verdict-low  { background: #FAECE7; color: #993C1D; }

        .fa-zone-tag { font-size: 11px; color: #9a9890; }
        .fa-progress-track {
          height: 6px; background: #eceae3; border-radius: 3px;
          overflow: hidden; margin-top: 16px;
        }
        .fa-progress-fill {
          height: 100%; border-radius: 3px;
          background: linear-gradient(90deg, #C0DD97, #639922);
          transition: width 0.6s ease;
        }
        .fa-suit-stats {
          display: grid; grid-template-columns: 1fr 1fr; gap: 10px;
          margin-top: 14px;
        }
        .fa-stat { font-size: 12px; color: #9a9890; display: flex; flex-direction: column; gap: 1px; }
        .fa-stat span { color: #1a1a18; font-weight: 500; font-size: 13px; }

        /* Crops */
        .fa-crop-list { display: flex; flex-direction: column; gap: 7px; }
        .fa-crop-item {
          display: flex; align-items: center; justify-content: space-between;
          padding: 9px 12px;
          background: #fafaf7; border: 1px solid #eceae3;
          border-radius: 8px;
        }
        .fa-crop-name { font-size: 13px; font-weight: 500; color: #2a2a28; }
        .fa-crop-fit {
          font-size: 10px; padding: 2px 9px; border-radius: 20px;
        }
        .fit-high { background: #EAF3DE; color: #27500A; }
        .fit-med  { background: #FAEEDA; color: #633806; }
        .fit-low  { background: #FAECE7; color: #993C1D; }

        /* Advisory */
        .fa-advisory { grid-column: 1 / -1; }
        .fa-tip-list { display: flex; flex-direction: column; gap: 8px; }
        .fa-tip {
          display: flex; align-items: flex-start; gap: 10px;
          padding: 10px 14px;
          background: #fafaf7; border: 1px solid #eceae3;
          border-radius: 8px;
          font-size: 13px; color: #5a5955;
        }
        .fa-tip-arrow {
          width: 20px; height: 20px; border-radius: 50%;
          background: #EAF3DE; color: #27500A;
          display: flex; align-items: center; justify-content: center;
          font-size: 11px; flex-shrink: 0; margin-top: 1px;
        }

        /* Charts row */
        .fa-charts { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        .fa-chart-title { font-size: 12px; font-weight: 500; color: #2a2a28; margin-bottom: 14px; }

        .fa-bar-chart {
          display: flex; align-items: flex-end; gap: 5px; height: 80px;
        }
        .fa-bar-col {
          flex: 1; display: flex; flex-direction: column;
          align-items: center; gap: 4px; height: 100%; justify-content: flex-end;
        }
        .fa-bar { width: 100%; border-radius: 3px 3px 0 0; min-height: 3px; }
        .fa-bar-lbl { font-size: 9px; color: #b0aea6; }

        .fa-donut-wrap { display: flex; align-items: center; gap: 18px; }
        .fa-legend { display: flex; flex-direction: column; gap: 8px; }
        .fa-legend-item { display: flex; align-items: center; gap: 8px; font-size: 12px; color: #5a5955; }
        .fa-legend-dot { width: 10px; height: 10px; border-radius: 2px; flex-shrink: 0; }

        /* Map mode */
        .fa-map-section { display: flex; flex-direction: column; gap: 12px; }
        .fa-map-wrap { border-radius: 10px; overflow: hidden; border: 1px solid #eceae3; }
        .fa-map-coords {
          display: flex; align-items: center; justify-content: space-between;
        }
        .fa-map-coords span { font-size: 13px; color: #5a5955; }

        /* Empty state */
        .fa-empty {
          display: flex; flex-direction: column;
          align-items: center; justify-content: center;
          padding: 48px 24px; gap: 10px;
          background: #fff; border-radius: 12px;
          border: 1px dashed #dddbd3;
          color: #9a9890;
        }
        .fa-empty-icon { font-size: 32px; }
        .fa-empty-text { font-size: 14px; }
        .fa-empty-sub { font-size: 12px; color: #b0aea6; }

        /* Error */
        .fa-error {
          font-size: 13px; color: #993C1D;
          background: #FAECE7; border: 1px solid #F5C4B3;
          border-radius: 8px; padding: 10px 14px; margin-top: 8px;
        }

        /* Pindula link */
        .fa-guides {
          background: #FAEEDA; border: 1px solid #FAC775;
          border-radius: 12px; padding: 18px 20px;
          grid-column: 1 / -1;
        }
        .fa-guides-title { font-size: 13px; font-weight: 500; color: #412402; margin-bottom: 6px; }
        .fa-guides-body { font-size: 12px; color: #633806; margin-bottom: 10px; }
        .fa-guides-link {
          font-size: 13px; font-weight: 500;
          color: #3B6D11; text-decoration: none;
        }
        .fa-guides-link:hover { text-decoration: underline; }

        /* Loading shimmer */
        .fa-shimmer {
          background: linear-gradient(90deg, #f0efe9 25%, #e8e7df 50%, #f0efe9 75%);
          background-size: 200% 100%;
          animation: fa-shimmer 1.4s infinite;
          border-radius: 8px;
        }
        @keyframes fa-shimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }

        /* Responsive */
        @media (max-width: 768px) {
          .fa-sidebar { display: none; }
          .fa-metrics { grid-template-columns: repeat(2, 1fr); }
          .fa-results-grid { grid-template-columns: 1fr; }
          .fa-charts { grid-template-columns: 1fr; }
          .fa-advisory { grid-column: 1; }
          .fa-guides { grid-column: 1; }
        }
      `}</style>

      <div className="fa-root">
        {/* Top bar */}
        <header className="fa-topbar">
          <div className="fa-logo">F</div>
          <div>
            <div className="fa-topbar-title">Farm Advisory</div>
            <div className="fa-topbar-sub">Zimbabwe crop suitability · SoilGrids + CHIRPS</div>
          </div>
          <div className="fa-topbar-right">
            {analysis?.model && (
              <span className="fa-badge fa-badge-model">{analysis.model}</span>
            )}
            <span className="fa-badge fa-badge-live">
              <span className="fa-live-dot" />
              Live data
            </span>
          </div>
        </header>

        <div className="fa-body">
          {/* Sidebar */}
          <aside className="fa-sidebar">
            <div className="fa-nav-section">Analysis</div>
            {NAV_ITEMS.map(item => (
              <button
                key={item.key}
                className={`fa-nav-item${activeNav === item.key ? ' active' : ''}`}
                onClick={() => setActiveNav(item.key)}
              >
                <span className="fa-nav-icon">{item.icon}</span>
                {item.label}
              </button>
            ))}

            <div className="fa-sidebar-divider" />
            <div className="fa-nav-section">Data sources</div>
            <div className="fa-data-pill">
              <span className="fa-dot" style={{ background: '#639922' }} />
              SoilGrids API
            </div>
            <div className="fa-data-pill">
              <span className="fa-dot" style={{ background: '#EF9F27' }} />
              CHIRPS rainfall
            </div>
            <div className="fa-data-pill">
              <span className="fa-dot" style={{ background: '#1D9E75' }} />
              AGRITEX rules
            </div>

            <div className="fa-sidebar-divider" />
            <div className="fa-nav-section">Regions</div>
            {REGIONS.map(r => (
              <button
                key={r}
                className="fa-nav-item"
                onClick={() => {
                  const rep = REGION_REPRESENTATIVES[r] ?? 'Harare'
                  setActiveNav('overview')
                  setPlace(rep)
                  searchByPlace(rep)
                }}
              >
                <span className="fa-nav-icon">▤</span>
                {r}
              </button>
            ))}

            <div className="fa-sidebar-footer">
              <p>University of Zimbabwe</p>
              <p>Knowledge-Based Rec. System</p>
            </div>
          </aside>

          {/* Main */}
          <main className="fa-main">

            {activeNav === 'manual' && (
              <div style={{ marginBottom: 16 }}>
                <SoilSampleForm onSubmit={handleSoilSample} loading={loading} />
              </div>
            )}

            {/* Search / Map picker */}
            {activeNav !== 'map' ? (
              activeNav === 'manual' ? null : (
                <div>
                  <div className="fa-search-row">
                    <div className="fa-search-wrap">
                      <span className="fa-search-icon">⌕</span>
                      <input
                        className="fa-search-input"
                        list="fa-places"
                        value={place}
                        onChange={e => setPlace(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && searchByPlace()}
                        placeholder="Search any town or district in Zimbabwe…"
                      />
                      <datalist id="fa-places">
                        {ALL_PLACES.map(p => <option key={p} value={p} />)}
                      </datalist>
                    </div>
                    <button className="fa-btn fa-btn-secondary" onClick={() => setActiveNav('map')}>
                      ⊞ Map
                    </button>
                    <button
                      className="fa-btn fa-btn-primary"
                      onClick={() => searchByPlace()}
                      disabled={loading}
                    >
                      {loading ? 'Analyzing…' : 'Analyze →'}
                    </button>
                  </div>

                  {activeNav !== 'overview' && (
                    <div style={{ marginTop: 10, fontSize: 12, color: '#6b6a66' }}>
                      {activeNav === 'soil'
                        ? 'Soil data view: focus on pH + fertility-driven advice'
                        : 'Rainfall view: focus on rainfall amount + drought risk advice'}
                    </div>
                  )}
                  <div className="fa-chips" style={{ marginTop: 8 }}>
                    <span className="fa-chips-label">Try:</span>
                    {QUICK_PLACES.map(p => (
                      <button key={p} className="fa-chip" onClick={() => { setPlace(p); searchByPlace(p) }}>
                        {p}
                      </button>
                    ))}
                  </div>
                  {error && <div className="fa-error">{error}</div>}
                </div>
              )
            ) : (
              <div className="fa-map-section">
                <p style={{ fontSize: 13, color: '#5a5955' }}>
                  Click or drag the marker on the map to select a location in Zimbabwe.
                </p>
                <div className="fa-map-wrap">
                  <MapPicker
                    lat={mapLat}
                    lon={mapLon}
                    onSelect={(l, ln) => { setMapLat(l); setMapLon(ln) }}
                    height="340px"
                  />
                </div>
                <div className="fa-map-coords">
                  <span>Selected: {mapLat.toFixed(4)}, {mapLon.toFixed(4)}</span>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="fa-btn fa-btn-secondary" onClick={() => setActiveNav('overview')}>
                      ← Back
                    </button>
                    <button
                      className="fa-btn fa-btn-primary"
                      onClick={searchByCoords}
                      disabled={loading}
                    >
                      {loading ? 'Analyzing…' : 'Analyze →'}
                    </button>
                  </div>
                </div>
                {error && <div className="fa-error">{error}</div>}
              </div>
            )}

            {/* Metric cards */}
            {(stats || analysis) && (
              <div className="fa-metrics">
                <div className="fa-metric accent">
                  <div className="fa-metric-label">Suitability score</div>
                  <div className="fa-metric-value">
                    {loading
                      ? '—'
                      : analysis
                        ? `${analysis.suitability_pct}%`
                        : '—'}
                  </div>
                  <div className="fa-metric-sub">
                    {analysis ? verdict?.label : 'Run analysis'}
                  </div>
                </div>
                <div className="fa-metric">
                  <div className="fa-metric-label">Annual rainfall</div>
                  <div className="fa-metric-value">
                    {analysis ? analysis.rainfall_mm : stats ? stats.avg_rainfall : '—'}
                  </div>
                  <div className="fa-metric-sub">mm / year</div>
                </div>
                <div className="fa-metric">
                  <div className="fa-metric-label">Soil pH</div>
                  <div className="fa-metric-value">
                    {analysis ? analysis.soil_ph : stats ? stats.avg_ph : '—'}
                  </div>
                  <div className="fa-metric-sub">
                    {analysis
                      ? analysis.soil_ph < 6 ? 'Acidic' : analysis.soil_ph > 7 ? 'Alkaline' : 'Slightly acidic'
                      : 'Dataset avg'}
                  </div>
                </div>
                <div className="fa-metric">
                  <div className="fa-metric-label">
                    {analysis ? 'Agro zone' : 'Suitable sites'}
                  </div>
                  <div className="fa-metric-value">
                    {analysis
                      ? analysis.zone
                      : stats
                        ? `${stats.suitable_pct}%`
                        : '—'}
                  </div>
                  <div className="fa-metric-sub">
                    {analysis ? 'Natural region' : `of ${stats?.total_locations.toLocaleString()} sites`}
                  </div>
                </div>
              </div>
            )}

            {/* Loading state */}
            {loading && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div className="fa-shimmer" style={{ height: 120 }} />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="fa-shimmer" style={{ height: 180 }} />
                  <div className="fa-shimmer" style={{ height: 180 }} />
                </div>
              </div>
            )}

            {/* Results */}
            {!loading && analysis && (
              <>
                <div className="fa-results-grid">
                  {/* Suitability card */}
                  <div className="fa-card">
                    <div className="fa-card-label">Suitability analysis</div>
                    <div className="fa-suit-score">
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
                        <div className="fa-suit-number">{analysis.suitability_pct}</div>
                        <div className="fa-suit-pct">%</div>
                      </div>
                      <div>
                        <div className={`fa-suit-verdict ${verdict?.cls}`}>{verdict?.label}</div>
                        <div className="fa-zone-tag">{analysis.zone}</div>
                      </div>
                    </div>
                    <div className="fa-progress-track">
                      <div className="fa-progress-fill" style={{ width: `${analysis.suitability_pct}%` }} />
                    </div>
                    <div className="fa-suit-stats">
                      <div className="fa-stat">Rainfall<span>{analysis.rainfall_mm} mm/yr</span></div>
                      <div className="fa-stat">Soil pH<span>{analysis.soil_ph}</span></div>
                      <div className="fa-stat">Latitude<span>{analysis.lat != null ? analysis.lat.toFixed(4) : '—'}</span></div>
                      <div className="fa-stat">Longitude<span>{analysis.lon != null ? analysis.lon.toFixed(4) : '—'}</span></div>
                    </div>
                  </div>

                  {/* Crops */}
                  <div className="fa-card">
                    <div className="fa-card-label">Suggested crops</div>
                    {analysis.suggested_crops.length > 0 ? (
                      <div className="fa-crop-list">
                        {analysis.suggested_crops.map(c => {
                          const fit = getFitLabel(c)
                          return (
                            <div key={c} className="fa-crop-item">
                              <span className="fa-crop-name">{c}</span>
                              <span className={`fa-crop-fit ${fit.cls}`}>{fit.label}</span>
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <p style={{ fontSize: 13, color: '#9a9890' }}>
                        See advisory tips below for crop recommendations.
                      </p>
                    )}
                  </div>

                  {/* Advisory */}
                  <div className="fa-card fa-advisory">
                    <div className="fa-card-label">Advisory tips — AGRITEX recommendations</div>
                    <div className="fa-tip-list">
                      {(filteredRecommendations.length > 0 ? filteredRecommendations : analysis.recommendations).map((rec, i) => (
                        <div key={i} className="fa-tip">
                          <div className="fa-tip-arrow">→</div>
                          <span>{rec}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Charts */}
                  {view !== 'soil' && (
                    <>
                      <div className="fa-card">
                        <div className="fa-chart-title">Monthly rainfall distribution</div>
                        <div className="fa-bar-chart">
                          {MONTHLY_WEIGHTS.map((w, i) => {
                            const mm = Math.round(w * analysis.rainfall_mm)
                            const maxMm = Math.round(Math.max(...MONTHLY_WEIGHTS) * analysis.rainfall_mm)
                            const pct = maxMm > 0 ? (mm / maxMm) * 100 : 0
                            const color = pct > 50
                              ? '#639922'
                              : pct > 20
                                ? '#97C459'
                                : pct > 8
                                  ? '#EF9F27'
                                  : '#D3D1C7'
                            return (
                              <div key={i} className="fa-bar-col">
                                <div
                                  className="fa-bar"
                                  style={{ height: `${Math.max(pct, 3)}%`, background: color }}
                                  title={`${MONTH_LABELS[i]}: ~${mm} mm`}
                                />
                                <div className="fa-bar-lbl">{MONTH_LABELS[i]}</div>
                              </div>
                            )
                          })}
                        </div>
                      </div>

                      <div className="fa-card">
                        <div className="fa-chart-title">Dataset coverage — {stats?.total_locations.toLocaleString() ?? '—'} sites</div>
                        {stats ? (
                          <div className="fa-donut-wrap">
                            <svg width="90" height="90" viewBox="0 0 90 90">
                              <circle cx="45" cy="45" r="33" fill="none" stroke="#eceae3" strokeWidth="13" />
                              {/* Suitable */}
                              <circle
                                cx="45" cy="45" r="33" fill="none" stroke="#639922" strokeWidth="13"
                                strokeDasharray={`${(stats.suitable_pct / 100) * 207} 207`}
                                strokeDashoffset="0"
                                strokeLinecap="round"
                                transform="rotate(-90 45 45)"
                              />
                              {/* Marginal (approx) */}
                              <circle
                                cx="45" cy="45" r="33" fill="none" stroke="#EF9F27" strokeWidth="13"
                                strokeDasharray={`${((100 - stats.suitable_pct) * 0.6 / 100) * 207} 207`}
                                strokeDashoffset={`-${(stats.suitable_pct / 100) * 207}`}
                                strokeLinecap="round"
                                transform="rotate(-90 45 45)"
                              />
                              {/* Low (approx) */}
                              <circle
                                cx="45" cy="45" r="33" fill="none" stroke="#D3D1C7" strokeWidth="13"
                                strokeDasharray={`${((100 - stats.suitable_pct) * 0.4 / 100) * 207} 207`}
                                strokeDashoffset={`-${(stats.suitable_pct / 100) * 207}`}
                                strokeLinecap="round"
                                transform="rotate(-90 45 45)"
                              />
                              <text x="45" y="50" textAnchor="middle" fontSize="13" fontWeight="500"
                                fill="#1a1a18" fontFamily="DM Serif Display,serif">
                                {stats.suitable_pct}%
                              </text>
                            </svg>
                            <div className="fa-legend">
                              <div className="fa-legend-item">
                                <div className="fa-legend-dot" style={{ background: '#639922' }} />
                                Suitable — {stats.suitable_pct}%
                              </div>
                              <div className="fa-legend-item">
                                <div className="fa-legend-dot" style={{ background: '#EF9F27' }} />
                                Marginal — {Math.round((100 - stats.suitable_pct) * 0.6)}%
                              </div>
                              <div className="fa-legend-item">
                                <div className="fa-legend-dot" style={{ background: '#D3D1C7' }} />
                                Low — {Math.round((100 - stats.suitable_pct) * 0.4)}%
                              </div>
                            </div>
                          </div>
                        ) : (
                          <p style={{ fontSize: 12, color: '#9a9890' }}>Dataset stats unavailable.</p>
                        )}
                      </div>
                    </>
                  )}

                  {/* Farming guides */}
                  <div className="fa-guides">
                    <div className="fa-guides-title">📚 Farming guides</div>
                    <div className="fa-guides-body">
                      Free handbooks and guides for Zimbabwean farmers — Maize, Soya, Cotton, Livestock &amp; more.
                    </div>
                    <a
                      className="fa-guides-link"
                      href="https://news.pindula.co.zw/farming-guides-for-the-zimbabwean-farmer-handbooks-guides-resources/"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      View guides on Pindula →
                    </a>
                  </div>
                </div>
              </>
            )}

            {/* Empty state — no analysis yet */}
            {!loading && !analysis && (
              <div className="fa-empty">
                <div className="fa-empty-icon">🌱</div>
                <div className="fa-empty-text">Search for a location to get started</div>
                <div className="fa-empty-sub">
                  Enter any town or district in Zimbabwe above, or use the map picker.
                </div>
              </div>
            )}

          </main>
        </div>
      </div>
    </>
  )
}