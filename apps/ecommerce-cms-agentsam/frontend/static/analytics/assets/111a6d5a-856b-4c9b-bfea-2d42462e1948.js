// Main App — embedded mode (no sidebar/topbar)
function App() {
  const initial = window.__FNF_INITIAL_VIEW || 'overview';
  const [view, setView] = useState(initial);
  const [range, setRange] = useState('30d');

  React.useEffect(() => {
    function onMessage(event) {
      if (event.data?.type !== 'fnf-analytics-set-view') return;
      const next = event.data.view;
      if (next === 'overview' || next === 'finance' || next === 'health') {
        setView(next);
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const Page = view === 'overview' ? OverviewPage : view === 'finance' ? FinancePage : HealthPage;

  return (
    <div className="embed embed--light-shell">
      <div className="embed-bar embed-bar--range-only">
        <RangePicker value={range} onChange={setRange} />
      </div>
      <div className="page">
        <Page range={range} tenant="all" />
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
