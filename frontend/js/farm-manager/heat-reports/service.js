export async function fetchHeatReports(token) {
    const res = await fetch("/api/heat/all", {
        headers: { Authorization: `Bearer ${token}` }
    });
    return res.json();
}


export async function fetchHeatProgress(id, token) {
    const res = await fetch(`/api/heat/${id}/detail`, {
        headers: { Authorization: `Bearer ${token}` }
    });
    return res.json();
}