import { Capacitor } from '@capacitor/core'

export const isNative = Capacitor.isNativePlatform()
export const platform: 'android' | 'ios' | 'web' = Capacitor.getPlatform() as 'android' | 'ios' | 'web'
export const isAndroid = platform === 'android'
export const isWeb = !isNative
