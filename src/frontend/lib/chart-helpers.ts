export const darkThemeOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    title: {
      display: true,
      color: '#888888',
      font: { family: 'Outfit', weight: '500' as const, size: 12 }
    }
  },
  scales: {
    x: { display: false },
    y: {
      ticks: { color: '#666666', font: { family: 'Outfit', size: 11 } },
      grid: { color: '#222222' }
    }
  }
};
