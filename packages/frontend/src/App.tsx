import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useSession } from './hooks/useSession.js';
import { HomeScreen } from './screens/HomeScreen.js';
import { RoomScreen } from './screens/RoomScreen.js';

export function App() {
  const session = useSession();

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomeScreen session={session} />} />
        <Route path="/room/:code" element={<RoomScreen session={session} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
