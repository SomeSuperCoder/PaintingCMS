/**
 * App — route table for the 7 screens of the ux-design inventory.
 * All business screens are implemented. The AuthGate wraps the protected
 * routes (home, paintings, locations, owner): any 401 → «Сессия истекла»,
 * any 403 → «Доступ запрещён». The denied/expired screens are the only PUBLIC
 * routes (outside the gate) so the gate never re-triggers on them.
 * Unknown paths redirect to home.
 */
import { Navigate, Route, Routes } from 'react-router-dom';

import { AuthGate } from '@/lib/auth-gate';
import { DeniedPage } from '@/pages/denied';
import { ExpiredPage } from '@/pages/expired';
import { LocationsPage } from '@/pages/locations';
import { OwnerPage } from '@/pages/owner';
import { PaintingDetailPage } from '@/pages/painting-detail';
import { PaintingFormPage } from '@/pages/painting-form';
import { PaintingsListPage } from '@/pages/paintings-list';

import { ROUTES } from './routes';

export default function App() {
  return (
    <Routes>
      <Route element={<AuthGate />}>
        <Route path={ROUTES.home} element={<PaintingsListPage />} />
        <Route path={ROUTES.paintingDetail} element={<PaintingDetailPage />} />
        <Route path={ROUTES.paintingNew} element={<PaintingFormPage />} />
        <Route path={ROUTES.paintingEdit} element={<PaintingFormPage />} />
        <Route path={ROUTES.locations} element={<LocationsPage />} />
        <Route path={ROUTES.owner} element={<OwnerPage />} />
      </Route>
      <Route path={ROUTES.denied} element={<DeniedPage />} />
      <Route path={ROUTES.expired} element={<ExpiredPage />} />
      <Route path="*" element={<Navigate to={ROUTES.home} replace />} />
    </Routes>
  );
}
