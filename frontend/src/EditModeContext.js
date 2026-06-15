import React, { createContext, useContext, useState } from 'react';

const EditModeContext = createContext(null);

// Holds whether the user has unlocked edit mode. The admin key lives in
// sessionStorage (cleared when the tab closes); editMode mirrors its presence.
export function EditModeProvider({ children }) {
  const [editMode, setEditMode] = useState(() => !!sessionStorage.getItem('adminKey'));

  const unlock = (key) => {
    sessionStorage.setItem('adminKey', key);
    setEditMode(true);
  };

  const lock = () => {
    sessionStorage.removeItem('adminKey');
    setEditMode(false);
  };

  return (
    <EditModeContext.Provider value={{ editMode, unlock, lock }}>
      {children}
    </EditModeContext.Provider>
  );
}

export function useEditMode() {
  const ctx = useContext(EditModeContext);
  if (!ctx) {
    throw new Error('useEditMode debe usarse dentro de <EditModeProvider>');
  }
  return ctx;
}
