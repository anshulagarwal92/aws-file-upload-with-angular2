import { Component } from '@angular/core';
import {Http} from "@angular/http";

declare var CryptoJS: any;

@Component({
  selector: 'app-root',
  template: `
  <input type="text" [(ngModel)]="config.bucket" placeholder="The S3 Bucket"/><br/>
  <input type="text" [(ngModel)]="config.accessKey" placeholder="Your Access Key"/><br/>
  <input type="text" [(ngModel)]="config.secretAccessKey" placeholder="Your Secret Access Key"/><br/>
  <input type="text" [(ngModel)]="config.region" placeholder="The Region of the Bucket"/><br/>
  <input type="file" (change)="upload($event)"/><br/>
  <img *ngIf="imagePath" [src]="imagePath">
  `
})
export class AppComponent {
  uploader: S3Uploader;
  imagePath: string;
  config = new S3Config();
  
  constructor(private http: Http) {
    this.uploader = new S3Uploader();
    
    // Input your S3 Config
    this.uploader.init(http, this.config);
  }
  
  upload(event) {
    let file = event.srcElement.files[0];

    this.uploader.upload(file).then((x) => {
      this.imagePath = x;
    });
  }
}

export class S3Config {
  bucket: string;
  accessKey: string;
  secretAccessKey: string;
  region: string;
  folder: string;
}

export class S3Uploader {
  private config: S3Config;
  private http: Http;

  init(http: Http, config: S3Config) {
    this.http = http;
    this.config = config;
  }

  upload(file: any): Promise<any> {
    let date = this.generateTimestamp();
    let datetime = date + 'T000000Z';

    let credential = `${this.config.accessKey}/${date}/${this.config.region}/s3/aws4_request`;

    let policy = JSON.stringify({
      "expiration": (new Date(Date.now() + 100000)).toISOString(),
      "conditions": [
        {"bucket": this.config.bucket},
        ["starts-with", "$key", ""],
        {"acl": "public-read"},
        ["starts-with", "$Content-Type", ""],
        {"x-amz-credential": credential},
        {"x-amz-algorithm": "AWS4-HMAC-SHA256"},
        {"x-amz-date": datetime}
      ]
    });

    let policyBase64 = window.btoa(policy);
    let signatureKey = this.generateSignatureKey(this.config.secretAccessKey, date, this.config.region, "s3");
    let signature = CryptoJS.HmacSHA256(policyBase64, signatureKey).toString(CryptoJS.enc.Hex);
    let formData = new FormData();

    formData.append('acl', "public-read");
    formData.append('Content-Type', file.type);
    formData.append('X-Amz-Date', datetime);
    formData.append('X-Amz-Algorithm', "AWS4-HMAC-SHA256");
    formData.append('X-Amz-Credential', credential);
    formData.append('X-Amz-Signature', signature);
    formData.append('Policy', policyBase64);
    formData.append('key', file.name);
    formData.append('file', file);

    return new Promise((resolve, reject) => {
      this.http.post(`https://${this.config.bucket}.s3.amazonaws.com/`, formData).subscribe(x => {
        console.log(x);
        resolve(x.headers.get("Location"));
      }, x => {
        console.error(x);
        reject();
      });
    });
  }

  generateSignatureKey(key, dateStamp, regionName, serviceName) {
    let kDate = CryptoJS.HmacSHA256(dateStamp, "AWS4" + key);
    let kRegion = CryptoJS.HmacSHA256(regionName, kDate);
    let kService = CryptoJS.HmacSHA256(serviceName, kRegion);
    let kSigning = CryptoJS.HmacSHA256("aws4_request", kService);

    return kSigning;
  }

  generateTimestamp() {
    let date = new Date();
    let year = date.getFullYear();
    let month = ("0" + (date.getMonth() + 1)).slice(-2);
    let day = ("0" + date.getDate()).slice(-2);
    return year + month + day;
  }
}