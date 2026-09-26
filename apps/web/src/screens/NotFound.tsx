import { Button, EmptyState, PageHeader } from '../components/ui/index.js';

export default function NotFound() {
  return (
    <>
      <PageHeader title="Page not found" />
      <EmptyState
        icon="search"
        title="That link does not exist"
        actions={
          <>
            <Button variant="primary" to="/home" icon="home">
              Go to the home screen
            </Button>
            <Button to="/emergency" icon="sos">
              Emergency
            </Button>
          </>
        }
      >
        It may have moved when the app was reorganised. Everything is reachable from Home.
      </EmptyState>
    </>
  );
}
