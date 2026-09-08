package kr.polarad.crm;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import android.util.Base64;

final class SecureSessionStore {
    private static final String KEYSTORE = "AndroidKeyStore";
    private static final String ALIAS = "polarad-crm-session";
    private final SharedPreferences prefs;
    SecureSessionStore(Context c) { prefs = c.getSharedPreferences("session", Context.MODE_PRIVATE); }
    private SecretKey key() throws Exception {
        KeyStore ks = KeyStore.getInstance(KEYSTORE); ks.load(null);
        if (!ks.containsAlias(ALIAS)) {
            KeyGenerator g = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE);
            g.init(new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT).setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
            g.generateKey();
        }
        return ((KeyStore.SecretKeyEntry) ks.getEntry(ALIAS, null)).getSecretKey();
    }
    void save(String value) throws Exception {
        Cipher c = Cipher.getInstance("AES/GCM/NoPadding"); c.init(Cipher.ENCRYPT_MODE, key());
        boolean saved = prefs.edit().putString("iv", Base64.encodeToString(c.getIV(), Base64.NO_WRAP)).putString("value", Base64.encodeToString(c.doFinal(value.getBytes(StandardCharsets.UTF_8)), Base64.NO_WRAP)).commit();
        if (!saved) throw new IOException("session_save_failed");
    }
    String read() throws Exception {
        String iv = prefs.getString("iv", null), value = prefs.getString("value", null); if (iv == null || value == null) return null;
        Cipher c = Cipher.getInstance("AES/GCM/NoPadding"); c.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, Base64.decode(iv, Base64.NO_WRAP)));
        return new String(c.doFinal(Base64.decode(value, Base64.NO_WRAP)), StandardCharsets.UTF_8);
    }
    void clear() throws IOException { if (!prefs.edit().clear().commit()) throw new IOException("session_clear_failed"); }
}
