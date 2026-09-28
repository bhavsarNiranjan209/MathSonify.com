interface Props {
  track: any;
}

export default function Inspector({ track }: Props) {
  if (!track) return <p className="ml-empty">No track selected</p>;

  return (
    <section className="ml-inspector" aria-label="Inspector">
      <div className="ml-panel-head">
        <div>
          <p className="ml-eyebrow">Track</p>
          <h2>Inspector</h2>
        </div>
      </div>
      <div className="ml-inspector-groups">
        <div className="ml-inspector-group">
          <h3>Volume & Pan</h3>
          <div className="ml-controls">
            <div className="ml-control">
              <label>
                <span>Volume <output>{Math.round(track.volume * 100)}%</output></span>
                <input type="range" min={0} max={1} step={0.01} value={track.volume} onChange={(e) => { /* updateTrack */ }} />
              </label>
            </div>
            <div className="ml-control">
              <label>
                <span>Pan <output>{Math.round(track.pan * 100)}%</output></span>
                <input type="range" min={-1} max={1} step={0.01} value={track.pan} onChange={(e) => { /* updateTrack */ }} />
              </label>
            </div>
          </div>
        </div>
        <div className="ml-inspector-group">
          <h3>Instrument Parameters</h3>
          <div className="ml-controls">
            {Object.entries(track.params || {}).map(([key, value]) => (
              <div key={key} className="ml-control">
                <label>
                  <span>{key.charAt(0).toUpperCase() + key.slice(1)} <output>{value}</output></span>
                  <input type="range" min={0} max={100} step={1} value={value} onChange={(e) => { /* updateTrack */ }} />
                </label>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}