export default function Home() {
  return (
    <>
      <h1>Is your Cook County property over-assessed?</h1>
      <p className="lede">
        Enter your address or 14-digit Property Index Number (PIN). We&apos;ll show your assessment history, tell you when your
        township is open for appeal, and find the comparable properties to use in your appeal.
      </p>
      <form action="/search" className="search" role="search">
        <input name="q" placeholder="123 N Main St, or 12-34-567-890-1234" aria-label="Address or PIN" autoFocus required />
        <button type="submit">Look up property</button>
      </form>
      <p className="meta">Covers single-family homes and buildings with 2–6 units in Cook County, Illinois.</p>
    </>
  );
}
