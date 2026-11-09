/**
 * CameraModal — live in-app camera (expo-camera) with a permission prompt.
 * On shutter, yields a Payload with BOTH base64 (for Gemini) and uri (for the
 * thumbnail). If permission is denied, offers the library picker fallback.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Modal, View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { CameraView, useCameraPermissions, type CameraType } from 'expo-camera';
import { colors } from '../../theme/tokens';
import { fonts } from '../../theme/typography';
import { Icon } from '../common/Icon';
import { Button } from '../common/Button';
import type { Payload } from '../../types';

export function CameraModal({
  visible,
  onCapture,
  onClose,
  onPickInstead,
  onPrompt,
}: {
  visible: boolean;
  onCapture: (p: Payload) => void;
  onClose: () => void;
  onPickInstead: () => void;
  /** true while Android's "allow camera?" box is up. The Private folder uses it so that box does not lock the folder. */
  onPrompt?: (on: boolean) => void;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<CameraType>('back');
  const [busy, setBusy] = useState(false);
  const camRef = useRef<CameraView>(null);

  const ask = async () => {
    onPrompt?.(true);
    try {
      await requestPermission();
    } finally {
      // Some phones report "background" a moment after the box closes
      setTimeout(() => onPrompt?.(false), 1500);
    }
  };

  useEffect(() => {
    if (visible && permission && !permission.granted && permission.canAskAgain) {
      void ask();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, permission]);

  const shoot = async () => {
    if (!camRef.current || busy) return;
    setBusy(true);
    try {
      const photo = await camRef.current.takePictureAsync({ base64: true, quality: 0.9 });
      if (photo?.base64) {
        onCapture({
          kind: 'image',
          data: photo.base64,
          mediaType: 'image/jpeg',
          uri: photo.uri,
          label: 'camera.jpg',
        });
      }
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
    }
  };

  const denied = permission && !permission.granted && !permission.canAskAgain;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.root}>
        {permission?.granted ? (
          <>
            <CameraView ref={camRef} style={styles.preview} facing={facing} />
            <View style={styles.bar}>
              <Pressable style={styles.barBtn} onPress={onClose}>
                <Text style={styles.barTxt}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.shutter} onPress={shoot}>
                {busy ? <ActivityIndicator color={colors.ink} /> : null}
              </Pressable>
              <Pressable
                style={styles.barBtn}
                onPress={() => setFacing((f) => (f === 'back' ? 'front' : 'back'))}
              >
                <Icon name="flip" size={20} color="#fff" />
              </Pressable>
            </View>
          </>
        ) : (
          <View style={styles.permWrap}>
            <Text style={styles.permTitle}>
              {denied ? 'Camera permission denied' : 'Camera access needed'}
            </Text>
            <Text style={styles.permText}>
              {denied
                ? 'Enable the camera in system settings, or choose an existing photo instead.'
                : 'Allow camera access to capture a photo — a flyer, menu, card, anything.'}
            </Text>
            <View style={styles.permBtns}>
              {!denied && permission?.canAskAgain ? (
                <Button label="Allow camera" variant="primary" onPress={() => void ask()} />
              ) : null}
              <Button label="Choose photo" variant="ghost" onPress={onPickInstead} />
              <Button label="Cancel" variant="ghost" onPress={onClose} />
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  preview: { flex: 1, width: '100%' },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 18,
    paddingBottom: 30,
    backgroundColor: '#000',
  },
  barBtn: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    minWidth: 64,
    alignItems: 'center',
  },
  barTxt: { color: '#fff', fontFamily: fonts.inter, fontSize: 14 },
  shutter: {
    width: 66,
    height: 66,
    borderRadius: 33,
    backgroundColor: '#fff',
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  permWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 12, backgroundColor: colors.canvas },
  permTitle: { fontFamily: fonts.groteskSemi, fontSize: 18, color: colors.ink, textAlign: 'center' },
  permText: { fontFamily: fonts.inter, fontSize: 14, color: colors.muted, textAlign: 'center', lineHeight: 20 },
  permBtns: { gap: 10, marginTop: 8, alignItems: 'stretch', alignSelf: 'stretch', paddingHorizontal: 30 },
});
