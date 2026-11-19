//! Public TLS peer certificate verification against bundled Mozilla root CAs.

use std::sync::OnceLock;
#[cfg(test)]
use std::sync::Mutex;

use boring::ssl::SslRef;
use boring::stack::{Stack, StackRef};
use boring::x509::store::{X509Store, X509StoreBuilder};
use boring::x509::{X509, X509StoreContext};

use crate::error::{OryvexCoreError, Result};

const ROOTS_PEM: &str = include_str!("public_roots.pem");

fn tls_err(e: impl std::fmt::Display) -> OryvexCoreError {
    OryvexCoreError::Tls(e.to_string())
}

fn roots() -> &'static X509Store {
    static ROOTS: OnceLock<X509Store> = OnceLock::new();
    ROOTS.get_or_init(|| {
        let mut b = X509StoreBuilder::new().expect("a certificate store");
        if let Ok(list) = X509::stack_from_pem(ROOTS_PEM.as_bytes()) {
            for cert in list {
                let _ = b.add_cert(cert);
            }
        }
        b.build()
    })
}

#[cfg(test)]
static TEST_TRUST_ANCHORS: OnceLock<Mutex<Vec<Vec<u8>>>> = OnceLock::new();

/// Register an ephemeral self-signed test server certificate as a test-only trust anchor.
/// Production trust roots and verification are unchanged.
#[cfg(test)]
pub(crate) fn register_test_trust_anchor(cert: &X509) {
    TEST_TRUST_ANCHORS
        .get_or_init(|| Mutex::new(Vec::new()))
        .lock()
        .expect("test trust anchors")
        .push(cert.to_pem().expect("test certificate PEM"));
}

#[cfg(test)]
fn test_roots() -> X509Store {
    let mut builder = X509StoreBuilder::new().expect("a certificate store");
    if let Ok(certs) = X509::stack_from_pem(ROOTS_PEM.as_bytes()) {
        for cert in certs {
            let _ = builder.add_cert(cert);
        }
    }
    let anchors = TEST_TRUST_ANCHORS
        .get_or_init(|| Mutex::new(Vec::new()))
        .lock()
        .expect("test trust anchors")
        .clone();
    for pem in anchors {
        if let Ok(certs) = X509::stack_from_pem(&pem) {
            for cert in certs {
                let _ = builder.add_cert(cert);
            }
        }
    }
    builder.build()
}

fn chain_is_trusted(leaf: &X509, chain: &StackRef<X509>) -> Result<bool> {
    let mut ctx = X509StoreContext::new().map_err(tls_err)?;
    #[cfg(test)]
    {
        let store = test_roots();
        ctx.init(&store, leaf, chain, |context| context.verify_cert())
            .map_err(tls_err)
    }
    #[cfg(not(test))]
    {
        ctx.init(roots(), leaf, chain, |context| context.verify_cert())
            .map_err(tls_err)
    }
}

/// `pattern` (a certificate name, possibly `*.x`) covers `name`.
pub fn dns_match(pattern: &str, name: &str) -> bool {
    let pattern = pattern.to_ascii_lowercase();
    let name = name.to_ascii_lowercase();
    if let Some(rest) = pattern.strip_prefix("*.") {
        match name.split_once('.') {
            Some((label, tail)) => !label.is_empty() && tail == rest,
            None => false,
        }
    } else {
        pattern == name
    }
}

/// Verifies that the peer certificate chain leads to a trusted root and matches `expected_name`.
pub(crate) fn verify_public_peer(ssl: &SslRef, expected_name: &str) -> Result<()> {
    let leaf = ssl
        .peer_certificate()
        .ok_or_else(|| tls_err("the server sent no certificate"))?;
    let empty;
    let chain = match ssl.peer_cert_chain() {
        Some(c) => c,
        None => {
            empty = Stack::<X509>::new().map_err(tls_err)?;
            &*empty
        }
    };
    let trusted = chain_is_trusted(&leaf, chain)?;
    if !trusted {
        return Err(tls_err(
            "the server certificate is not signed by a trusted authority",
        ));
    }
    let Some(sans) = leaf.subject_alt_names() else {
        return Err(tls_err("the server certificate names nothing"));
    };
    let expected_ip = expected_name.parse::<std::net::IpAddr>().ok().map(|ip| match ip {
        std::net::IpAddr::V4(ip) => ip.octets().to_vec(),
        std::net::IpAddr::V6(ip) => ip.octets().to_vec(),
    });
    let matches_name = sans.iter().any(|name| match &expected_ip {
        Some(ip) => name.ipaddress().is_some_and(|value| value == ip.as_slice()),
        None => name.dnsname().is_some_and(|value| dns_match(value, expected_name)),
    });
    if matches_name {
        return Ok(());
    }
    Err(tls_err(format!(
        "the server certificate is not for {expected_name}"
    )))
}
