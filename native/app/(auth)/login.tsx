import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, Alert } from "react-native";
import { router } from "expo-router";
import * as SecureStore from "expo-secure-store";

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3100/api";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    if (!email || !password) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/auth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        Alert.alert("Login failed", data.error ?? "Invalid credentials");
        return;
      }
      await SecureStore.setItemAsync("substaff.auth.token", data.token);
      router.replace("/(app)/(tabs)");
    } catch {
      Alert.alert("Error", "Could not connect to server");
    } finally {
      setLoading(false);
    }
  }

  return (
    <View className="flex-1 justify-center px-6 bg-background">
      <Text className="text-3xl font-bold text-center mb-8 text-foreground">
        Substaff
      </Text>

      <TextInput
        className="border border-border rounded-lg px-4 py-3 mb-4 text-foreground bg-card"
        placeholder="Email"
        placeholderTextColor="#9ca3af"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        textContentType="emailAddress"
      />

      <TextInput
        className="border border-border rounded-lg px-4 py-3 mb-6 text-foreground bg-card"
        placeholder="Password"
        placeholderTextColor="#9ca3af"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        textContentType="password"
      />

      <TouchableOpacity
        className="bg-primary rounded-lg py-3 items-center"
        onPress={handleLogin}
        disabled={loading}
      >
        <Text className="text-primary-foreground font-semibold text-base">
          {loading ? "Signing in..." : "Sign In"}
        </Text>
      </TouchableOpacity>
    </View>
  );
}
