// GENERATED CODE -- DO NOT EDIT!

'use strict';
var grpc = require('@grpc/grpc-js');
var knowledge_pb = require('./knowledge_pb.js');
var google_protobuf_timestamp_pb = require('google-protobuf/google/protobuf/timestamp_pb.js');
var common_pb = require('./common_pb.js');
var errors_pb = require('./errors_pb.js');

function serialize_agentsam_knowledge_v1_GetJobRequest(arg) {
  if (!(arg instanceof knowledge_pb.GetJobRequest)) {
    throw new Error('Expected argument of type agentsam.knowledge.v1.GetJobRequest');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_agentsam_knowledge_v1_GetJobRequest(buffer_arg) {
  return knowledge_pb.GetJobRequest.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_agentsam_knowledge_v1_Job(arg) {
  if (!(arg instanceof knowledge_pb.Job)) {
    throw new Error('Expected argument of type agentsam.knowledge.v1.Job');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_agentsam_knowledge_v1_Job(buffer_arg) {
  return knowledge_pb.Job.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_agentsam_knowledge_v1_JobEvent(arg) {
  if (!(arg instanceof knowledge_pb.JobEvent)) {
    throw new Error('Expected argument of type agentsam.knowledge.v1.JobEvent');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_agentsam_knowledge_v1_JobEvent(buffer_arg) {
  return knowledge_pb.JobEvent.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_agentsam_knowledge_v1_ListRepositoriesRequest(arg) {
  if (!(arg instanceof knowledge_pb.ListRepositoriesRequest)) {
    throw new Error('Expected argument of type agentsam.knowledge.v1.ListRepositoriesRequest');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_agentsam_knowledge_v1_ListRepositoriesRequest(buffer_arg) {
  return knowledge_pb.ListRepositoriesRequest.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_agentsam_knowledge_v1_ListRepositoriesResponse(arg) {
  if (!(arg instanceof knowledge_pb.ListRepositoriesResponse)) {
    throw new Error('Expected argument of type agentsam.knowledge.v1.ListRepositoriesResponse');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_agentsam_knowledge_v1_ListRepositoriesResponse(buffer_arg) {
  return knowledge_pb.ListRepositoriesResponse.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_agentsam_knowledge_v1_SubmitJobRequest(arg) {
  if (!(arg instanceof knowledge_pb.SubmitJobRequest)) {
    throw new Error('Expected argument of type agentsam.knowledge.v1.SubmitJobRequest');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_agentsam_knowledge_v1_SubmitJobRequest(buffer_arg) {
  return knowledge_pb.SubmitJobRequest.deserializeBinary(new Uint8Array(buffer_arg));
}

function serialize_agentsam_knowledge_v1_WatchJobRequest(arg) {
  if (!(arg instanceof knowledge_pb.WatchJobRequest)) {
    throw new Error('Expected argument of type agentsam.knowledge.v1.WatchJobRequest');
  }
  return Buffer.from(arg.serializeBinary());
}

function deserialize_agentsam_knowledge_v1_WatchJobRequest(buffer_arg) {
  return knowledge_pb.WatchJobRequest.deserializeBinary(new Uint8Array(buffer_arg));
}


var KnowledgeServiceService = exports.KnowledgeServiceService = {
  listRepositories: {
    path: '/agentsam.knowledge.v1.KnowledgeService/ListRepositories',
    requestStream: false,
    responseStream: false,
    requestType: knowledge_pb.ListRepositoriesRequest,
    responseType: knowledge_pb.ListRepositoriesResponse,
    requestSerialize: serialize_agentsam_knowledge_v1_ListRepositoriesRequest,
    requestDeserialize: deserialize_agentsam_knowledge_v1_ListRepositoriesRequest,
    responseSerialize: serialize_agentsam_knowledge_v1_ListRepositoriesResponse,
    responseDeserialize: deserialize_agentsam_knowledge_v1_ListRepositoriesResponse,
  },
  submitJob: {
    path: '/agentsam.knowledge.v1.KnowledgeService/SubmitJob',
    requestStream: false,
    responseStream: false,
    requestType: knowledge_pb.SubmitJobRequest,
    responseType: knowledge_pb.Job,
    requestSerialize: serialize_agentsam_knowledge_v1_SubmitJobRequest,
    requestDeserialize: deserialize_agentsam_knowledge_v1_SubmitJobRequest,
    responseSerialize: serialize_agentsam_knowledge_v1_Job,
    responseDeserialize: deserialize_agentsam_knowledge_v1_Job,
  },
  getJob: {
    path: '/agentsam.knowledge.v1.KnowledgeService/GetJob',
    requestStream: false,
    responseStream: false,
    requestType: knowledge_pb.GetJobRequest,
    responseType: knowledge_pb.Job,
    requestSerialize: serialize_agentsam_knowledge_v1_GetJobRequest,
    requestDeserialize: deserialize_agentsam_knowledge_v1_GetJobRequest,
    responseSerialize: serialize_agentsam_knowledge_v1_Job,
    responseDeserialize: deserialize_agentsam_knowledge_v1_Job,
  },
  watchJob: {
    path: '/agentsam.knowledge.v1.KnowledgeService/WatchJob',
    requestStream: false,
    responseStream: true,
    requestType: knowledge_pb.WatchJobRequest,
    responseType: knowledge_pb.JobEvent,
    requestSerialize: serialize_agentsam_knowledge_v1_WatchJobRequest,
    requestDeserialize: deserialize_agentsam_knowledge_v1_WatchJobRequest,
    responseSerialize: serialize_agentsam_knowledge_v1_JobEvent,
    responseDeserialize: deserialize_agentsam_knowledge_v1_JobEvent,
  },
};

exports.KnowledgeServiceClient = grpc.makeGenericClientConstructor(KnowledgeServiceService, 'KnowledgeService');
