import { PipelineToolbar } from './toolbar';
import { PipelineUI } from './ui';
import { SubmitButton } from './submit';
import './App.css';

function App() {
  return (
    <div className="app">
      <PipelineToolbar />
      <main className="app__canvas">
        <PipelineUI />
      </main>
      <footer className="app__footer">
        <SubmitButton />
      </footer>
    </div>
  );
}

export default App;
