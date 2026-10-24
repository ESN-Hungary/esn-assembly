# Deploying with externally managed DNS

This guide explains how to deploy ESN Assembly when the domain's DNS records
are managed by a provider other than Amazon Route 53.

The deployment supports both external DNS and Route 53. The mode is selected
in [`back-end/deploy/environments.ts`](./back-end/deploy/environments.ts):

```ts
export const DNS_MODE: DnsMode = 'external';
```

Use `external` when DNS records stay at your current provider. Use `route53`
only when the matching public hosted zone is available in the AWS account.

## 1. Configure the domain and AWS profile

Set these values in `back-end/deploy/environments.ts`:

- `DOMAIN`: the base domain, for example `assembly.example.org`;
- `PROD_CUSTOM_DOMAIN`: the production front-end hostname, or `null`;
- `DNS_MODE`: `external`;
- `AWS_PROFILE` and `PROJECT` in `back-end/deploy.sh`.

The deployment region is the region configured for the AWS profile. The
CloudFront certificate must always be in `us-east-1`.

## 2. Create ACM certificates

In external mode, certificates are requested and validated manually. Create
certificates with DNS validation and add the validation CNAME records at the
external DNS provider.

The certificates must be in the service's required region:

| Service | Certificate region | Names |
| --- | --- | --- |
| HTTP API Gateway | deployment region | `api.<DOMAIN>` |
| WebSocket API Gateway | deployment region | `socket.<DOMAIN>` |
| CloudFront | `us-east-1` | `<DOMAIN>` and `*.<DOMAIN>` |

The wildcard certificate covers first-level subdomains such as
`dev.<DOMAIN>` and `media.<DOMAIN>`.

One certificate in the deployment region can cover both API names. CloudFront
uses the separate `us-east-1` certificate. SES does not use ACM certificates.

After requesting each certificate, obtain its validation records:

```sh
aws acm describe-certificate \
  --region {REGION} \
  --profile {AWS_PROFILE} \
  --certificate-arn {CERTIFICATE_ARN}
```

Add every returned `ResourceRecord` as a DNS-only CNAME record. Wait for all
certificates to show `ISSUED` before deploying.

## 3. Configure existing resource ARNs

Copy the issued certificate ARNs and the verified SES identity ARN into the
`parameters` object:

```ts
apiCertificateARN: '{API_CERTIFICATE_ARN}',
webSocketCertificateARN: '{WEBSOCKET_CERTIFICATE_ARN}',
frontEndCertificateARN: '{CLOUDFRONT_CERTIFICATE_ARN}',
mediaCertificateARN: '{CLOUDFRONT_CERTIFICATE_ARN}',
sesIdentityARN: 'arn:aws:ses:{REGION}:{ACCOUNT}:identity/{SENDER}',
```

The sender must be an SES-verified email identity. The Lambda functions use
`SES_SOURCE_ADDRESS`, which must match that verified identity exactly.

## 4. Deploy the environment

From `back-end`:

```sh
npm install
npm run compile
npm run lint -- deploy src
npx cdk diff --all --context stage=dev --profile {AWS_PROFILE}
npx cdk deploy --all --context stage=dev \
  --require-approval never --profile {AWS_PROFILE}
```

Deploy `prod` separately after validating `dev`:

```sh
npx cdk deploy --all --context stage=prod \
  --require-approval never --profile {AWS_PROFILE}
```

External mode does not create Route 53 records. It outputs the AWS targets
that must be entered at the external DNS provider.

## 5. Create application DNS records

Use the CloudFormation outputs and create these records at the external DNS
provider. Use DNS-only mode and a short TTL while migrating.

| Name | Type | Target |
| --- | --- | --- |
| `api.<DOMAIN>` | CNAME | `CustomDomainTarget` from the API domain stack |
| `socket.<DOMAIN>` | CNAME | `CustomDomainTarget` from the socket API stack |
| `media.<DOMAIN>` | CNAME | `MediaCloudFrontDomainName` |
| `dev.<DOMAIN>` | CNAME | `CloudFrontDomainName` from the dev front-end stack |
| `<DOMAIN>` | ALIAS/ANAME or provider root-CNAME | `CloudFrontDomainName` from the prod front-end stack |

Do not use the old domain's targets. API Gateway and CloudFront targets are
generated per deployment and should be copied from the current stack outputs.

## 6. Verify the migration

Check the AWS resources:

```sh
aws acm list-certificates --region {REGION} --profile {AWS_PROFILE}
aws apigatewayv2 get-domain-names --region {REGION} --profile {AWS_PROFILE}
aws cloudformation describe-stacks \
  --stack-name {PROJECT}-dev-api \
  --profile {AWS_PROFILE}
```

Check public DNS:

```sh
nslookup api.<DOMAIN>
nslookup socket.<DOMAIN>
nslookup media.<DOMAIN>
```

An API root request may return `403 Forbidden`; that still confirms that DNS,
TLS, and API Gateway are connected. Test an actual application endpoint for
functional verification.

## Switching back to Route 53

The deployment is intentionally switchable. Change:

```ts
export const DNS_MODE: DnsMode = 'route53';
```

In Route 53 mode, CDK restores hosted-zone lookups, Route 53 alias records,
automatic ACM DNS validation, and automatic SES domain verification.

Before switching, ensure that the AWS account has exactly one matching public
hosted zone. Review the result first:

```sh
npx cdk diff --all --context stage=dev --profile {AWS_PROFILE}
```

Do not switch modes during an active migration without checking the diff and
confirming that the intended hosted zone and certificates are being used.
