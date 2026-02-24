export default function Footer() {
  return (
    <footer className="footer">
      <div className="footer-inner">
        <div className="footer-left">
          <h3>The Spa Synergy</h3>
          <p>14310 Castle Dr<br/>Fort Ritchie, MD 21719</p>
        </div>
      </div>

      <div className="footer-bottom">
        © {new Date().getFullYear()} The Spa Synergy. All rights reserved.
      </div>
    </footer>
  )
}