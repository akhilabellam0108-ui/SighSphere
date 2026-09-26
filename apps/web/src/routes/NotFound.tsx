import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <>
      <h1>Page not found</h1>
      <p className="lede">That link does not exist.</p>
      <Link className="btn primary" to="/">
        Go to the home screen
      </Link>
    </>
  );
}
