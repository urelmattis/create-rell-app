// @ts-nocheck -- template-only; the scaffold engine strips this line before writing to user projects so scaffolded output has normal TypeScript checking.
// Example form — React Hook Form + Zod on React Native (Story 4.2).
//
// Mirrors the web ProfileForm but uses `Controller` instead of `register`.
// React Native inputs (`TextInput`) are not HTML form elements — RHF can't
// intercept `onChange`/`onBlur` via ref-based `register`, so we use the
// `Controller` render-prop pattern to bridge RHF state with RN inputs.
//
// The Zod schema is imported from `@{{projectNameKebab}}/shared` — the exact
// same file the web form uses. Type safety is guaranteed by `z.infer<>`.

import { standardSchemaResolver } from '@hookform/resolvers/standard-schema';
import { Controller, useForm } from 'react-hook-form';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { profileFormSchema } from '@{{projectNameKebab}}/shared';
import type { ProfileFormValues } from '@{{projectNameKebab}}/shared';

export function ProfileForm() {
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ProfileFormValues>({
    resolver: standardSchemaResolver(profileFormSchema),
    defaultValues: {
      displayName: '',
      bio: '',
      website: '',
    },
  });

  function onSubmit(values: ProfileFormValues) {
    // TODO: wire this to a server action or API route. The `values` object
    // has already been validated and coerced by Zod — it is safe to pass
    // directly to your backend without re-validation on the client side.
    if (__DEV__) {
      console.warn('[ProfileForm] onSubmit not wired — payload:', values);
    }
  }

  return (
    <View style={styles.form}>
      <View style={styles.field}>
        <Text style={styles.label}>Display name</Text>
        <Controller
          control={control}
          name="displayName"
          render={({ field: { value, onChange, onBlur } }) => (
            <TextInput
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              autoCapitalize="words"
              placeholder="Ada Lovelace"
              style={styles.input}
            />
          )}
        />
        {errors.displayName && <Text style={styles.error}>{errors.displayName.message}</Text>}
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Bio</Text>
        <Controller
          control={control}
          name="bio"
          render={({ field: { value, onChange, onBlur } }) => (
            <TextInput
              value={value ?? ''}
              onChangeText={onChange}
              onBlur={onBlur}
              multiline
              numberOfLines={3}
              placeholder="A short bio"
              style={[styles.input, styles.textarea]}
            />
          )}
        />
        {errors.bio && <Text style={styles.error}>{errors.bio.message}</Text>}
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>Website</Text>
        <Controller
          control={control}
          name="website"
          render={({ field: { value, onChange, onBlur } }) => (
            <TextInput
              value={value ?? ''}
              onChangeText={onChange}
              onBlur={onBlur}
              autoCapitalize="none"
              keyboardType="url"
              placeholder="https://example.com"
              style={styles.input}
            />
          )}
        />
        {errors.website && <Text style={styles.error}>{errors.website.message}</Text>}
      </View>

      <Pressable onPress={handleSubmit(onSubmit)} disabled={isSubmitting} style={styles.button}>
        <Text style={styles.buttonText}>{isSubmitting ? 'Saving…' : 'Save profile'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: 16, padding: 16 },
  field: { gap: 4 },
  label: { fontSize: 14, fontWeight: '600' },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 6,
    padding: 10,
    fontSize: 16,
  },
  textarea: { minHeight: 80, textAlignVertical: 'top' },
  error: { color: '#c00', fontSize: 12 },
  button: {
    backgroundColor: '#111',
    paddingVertical: 12,
    borderRadius: 6,
    alignItems: 'center',
  },
  buttonText: { color: '#fff', fontWeight: '600' },
});
