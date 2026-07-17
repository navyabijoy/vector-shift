import { AppHeader } from './header';
import { PipelineSidebar } from './sidebar';
import { PipelineUI } from './ui';
import './App.css';

function App() {
  return (
    <div className="app">
      <AppHeader />
      <div className="app__body">
        <PipelineSidebar />
        <main className="app__canvas">
          <PipelineUI />
        </main>
      </div>
    </div>
  );
}

export default App;
