import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ApiGw from 'aws-cdk-lib/aws-apigatewayv2';

export interface ApiDomainProps extends cdk.StackProps {
  domain: string;
  certificateArn?: string;
}

export class ApiDomainStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: ApiDomainProps) {
    super(scope, id, props);

    if (!props.certificateArn) {
      throw new Error(`Missing ACM certificate ARN for ${props.domain}`);
    }

    const apiDomain = new ApiGw.CfnDomainName(this, 'ApiDomain', {
      domainName: props.domain,
      domainNameConfigurations: [{ certificateArn: props.certificateArn, endpointType: 'REGIONAL' }]
    });

    new cdk.CfnOutput(this, 'CustomDomainTarget', { value: apiDomain.attrRegionalDomainName });
  }
}
