import { isHapticsSupported } from '../../hooks/useDevice.js';
import { useSettings } from '../../state/settings.js';
import { Icon, Segmented, SliderField, SwitchField } from '../ui/index.js';

/**
 * Display + interaction preferences. Used by Accessibility Tools and by the Settings screen
 * area in Profile, so both always show the same controls.
 */
export default function AccessibilitySettings() {
  const { settings, update } = useSettings();
  return (
    <div className="stack">
      <Segmented
        legend="Appearance"
        value={settings.theme}
        onChange={(theme) => update({ theme })}
        options={[
          { value: 'system', label: 'System', icon: <Icon name="monitor" /> },
          { value: 'light', label: 'Light', icon: <Icon name="sun" /> },
          { value: 'dark', label: 'Dark', icon: <Icon name="moon" /> },
        ]}
      />
      <div>
        <SwitchField
          label="High contrast"
          hint="Maximum contrast, overriding light and dark mode."
          checked={settings.highContrast}
          onChange={(highContrast) => update({ highContrast })}
        />
        <SwitchField
          label="Reduce motion"
          hint="Removes animations and transitions."
          checked={settings.reduceMotion}
          onChange={(reduceMotion) => update({ reduceMotion })}
        />
        <SwitchField
          label="Haptic feedback"
          hint={
            isHapticsSupported()
              ? 'A short vibration when a sign is recognised or a capture starts.'
              : 'This device or browser cannot vibrate, so this setting has no effect here.'
          }
          checked={settings.haptics}
          onChange={(haptics) => update({ haptics })}
        />
      </div>
      <SliderField
        label={`Text size: ${Math.round(settings.fontScale * 100)}%`}
        value={settings.fontScale}
        min={0.85}
        max={1.6}
        step={0.05}
        valueText={`${Math.round(settings.fontScale * 100)} percent`}
        onChange={(fontScale) => update({ fontScale })}
      />
      <p className="font-preview" aria-hidden="true">
        The quick brown fox signs hello.
      </p>
    </div>
  );
}
