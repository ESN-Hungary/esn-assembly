import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ApiGw from 'aws-cdk-lib/aws-apigatewayv2';
import * as ACM from 'aws-cdk-lib/aws-certificatemanager';
import * as Route53 from 'aws-cdk-lib/aws-route53';
import * as Route53Targets from 'aws-cdk-lib/aws-route53-targets';

export interface ApiDomainProps extends cdk.StackProps {
  domain: string;
  dnsMode: 'route53' | 'external';
  certificateArn?: string;
}

export class ApiDomainStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: ApiDomainProps) {
    super(scope, id, props);

    const zone = props.dnsMode === 'route53'
      ? Route53.HostedZone.fromLookup(this, 'HostedZone', { domainName: props.domain.split('.').slice(-2).join('.') })
      : undefined;
    const certificate = props.dnsMode === 'route53'
      ? new ACM.DnsValidatedCertificate(this, 'ApiCertificate', { domainName: props.domain, hostedZone: zone! })
      : props.certificateArn
        ? ACM.Certificate.fromCertificateArn(this, 'ApiCertificate', props.certificateArn)
        : undefined;
    if (!certificate) {
      throw new Error(`Missing ACM certificate ARN for ${props.domain}`);
    }

    const apiDomain = new ApiGw.CfnDomainName(this, 'ApiDomain', {
      domainName: props.domain,
      domainNameConfigurations: [{ certificateArn: certificate.certificateArn, endpointType: 'REGIONAL' }]
    });

    if (zone) {
      new Route53.ARecord(this, 'DomainRecord', {
        zone,
        recordName: props.domain,
        target: Route53.RecordTarget.fromAlias(
          new Route53Targets.ApiGatewayv2DomainProperties(
            apiDomain.attrRegionalDomainName,
            apiDomain.attrRegionalHostedZoneId
          )
        )
      });
    }
    new cdk.CfnOutput(this, 'CustomDomainTarget', { value: apiDomain.attrRegionalDomainName });
  }
}
