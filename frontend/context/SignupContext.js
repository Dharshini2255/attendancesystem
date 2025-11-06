import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useContext, useEffect, useState } from 'react';

const SignupContext = createContext();

export const SignupProvider = ({ children }) => {
  const [signupData, setSignupData] = useState({});
  const [currentStep, setCurrentStep] = useState(1);
  const [signupCompleted, setSignupCompleted] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [resumeSignup, setResumeSignup] = useState(false); // NEW FLAG

  useEffect(() => {
    (async () => {
      try {
        const savedStep = await AsyncStorage.getItem('signupCurrentStep');
        const savedData = await AsyncStorage.getItem('signupData');
        const completed = await AsyncStorage.getItem('signupCompleted');

        if (completed === 'true') setSignupCompleted(true);

        // Only resume if user explicitly chooses to
        if (savedStep && savedData) {
          setResumeSignup(true); // user can choose to resume later
          setCurrentStep(parseInt(savedStep));
          setSignupData(JSON.parse(savedData));
        }
      } catch (err) {
        console.error('Error loading signup state:', err);
      } finally {
        setHydrated(true);
      }
    })();
  }, []);

  const updateSignupData = async (data) => {
    const newData = { ...signupData, ...data };
    setSignupData(newData);
    await AsyncStorage.setItem('signupData', JSON.stringify(newData));
  };

  const saveStep = async (step) => {
    setCurrentStep(step);
    await AsyncStorage.setItem('signupCurrentStep', step.toString());
  };

  const resetSignup = async () => {
    setSignupData({});
    setCurrentStep(1);
    setSignupCompleted(false);
    setResumeSignup(false);
    await AsyncStorage.removeItem('signupData');
    await AsyncStorage.removeItem('signupCurrentStep');
    await AsyncStorage.removeItem('signupCompleted');
  };

  const markSignupCompleted = async () => {
    setSignupCompleted(true);
    await AsyncStorage.setItem('signupCompleted', 'true');
  };

  const getInitialStep = () => {
    if (!hydrated) return null;
    return 'index'; // always start from index.js
  };

  return (
    <SignupContext.Provider
      value={{
        signupData,
        updateSignupData,
        currentStep,
        setCurrentStep,
        saveStep,
        resetSignup,
        getInitialStep,
        markSignupCompleted,
        hydrated,
        resumeSignup, // expose this so index.js can offer "Resume Signup"
      }}
    >
      {children}
    </SignupContext.Provider>
  );
};

export const useSignup = () => useContext(SignupContext);