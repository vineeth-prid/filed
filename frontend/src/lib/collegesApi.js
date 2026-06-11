// Public read-only access to the REAL pipeline-computed college dataset.
// Bridges the admin NIRF pipeline output (intelligence scores + derived
// metrics) to the public product. Pages can prefer this live data and fall
// back to the static mock dataset when the pipeline has not been run yet.
import axios from "axios";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export async function fetchLiveColleges({ year = 2024, category = "Engineering" } = {}) {
  try {
    const { data } = await axios.get(`${API}/colleges`, { params: { year, category } });
    return Array.isArray(data?.colleges) ? data.colleges : [];
  } catch {
    return [];
  }
}

export async function fetchLiveCollege(documentId) {
  try {
    const { data } = await axios.get(`${API}/colleges/${documentId}`);
    return data || null;
  } catch {
    return null;
  }
}
